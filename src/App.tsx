import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ePub, { type Book, type NavItem } from 'epubjs'
import {
  Alert,
  Button,
  Card,
  Drawer,
  Empty,
  Layout,
  Menu,
  Space,
  Typography,
  Upload,
} from 'antd'
import { MenuOutlined } from '@ant-design/icons'
import type { MenuProps, UploadProps } from 'antd'
import './App.css'

const { Content, Sider } = Layout
const { Text } = Typography

type ChapterNode = NavItem & {
  key: string
  children?: ChapterNode[]
}

type ChapterIndex = {
  items: MenuProps['items']
  hrefByKey: Record<string, string>
  labelByKey: Record<string, string>
  openKeys: string[]
  hrefEntries: Array<{ href: string; key: string }>
}

type BookMeta = {
  title: string
  creator: string
}

function normalizeHref(href: string) {
  return href.split('#')[0] ?? href
}

function isExternalHref(href: string) {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)
}

function normalizePath(path: string) {
  return path.replace(/^\//, '')
}

function resolveRelativeHref(baseHref: string, targetHref: string) {
  if (targetHref.startsWith('#')) {
    return `${normalizeHref(baseHref)}${targetHref}`
  }

  const normalizedBase = normalizePath(normalizeHref(baseHref))
  const baseUrl = new URL(normalizedBase, 'https://reader.local/')
  const resolvedUrl = new URL(targetHref, baseUrl)

  return `${resolvedUrl.pathname.replace(/^\//, '')}${resolvedUrl.hash}`
}

function resolveToArchivePath(sectionUrl: string, relativeSrc: string) {
  const base = new URL('https://epub.local' + sectionUrl)
  const resolved = new URL(relativeSrc, base)

  return resolved.pathname
}

async function rewriteResources(
  container: HTMLElement,
  book: Book,
  sectionUrl: string,
) {
  const mediaElements = container.querySelectorAll<HTMLElement>(
    'img[src], image[href], image[xlink\\:href], source[src], video[src], video[poster], audio[src]',
  )

  const pending: Array<Promise<void>> = []

  mediaElements.forEach((element) => {
    const attributes = ['src', 'href', 'xlink:href', 'poster']

    for (const attribute of attributes) {
      const value = element.getAttribute(attribute)

      if (!value || isExternalHref(value) || value.startsWith('blob:') || value.startsWith('data:')) {
        continue
      }

      const archivePath = resolveToArchivePath(sectionUrl, value)

      pending.push(
        book.archive.createUrl(archivePath, { base64: false }).then(
          (blobUrl) => element.setAttribute(attribute, blobUrl),
          () => { /* resource not found in archive, leave as-is */ },
        ),
      )
    }
  })

  await Promise.all(pending)
}

function rewriteInternalLinks(container: HTMLElement, sectionHref: string) {
  container.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((anchor) => {
    const href = anchor.getAttribute('href')

    if (!href || isExternalHref(href)) {
      return
    }

    anchor.setAttribute('data-epub-href', resolveRelativeHref(sectionHref, href))
    anchor.removeAttribute('href')
  })

  container.querySelectorAll('script').forEach((script) => script.remove())
}

function toChapterNodes(items: NavItem[], parentKey = 'chapter'): ChapterNode[] {
  return items.map((item, index) => {
    const key = `${parentKey}-${index}`
    const children = item.subitems?.length ? toChapterNodes(item.subitems, key) : undefined

    return {
      ...item,
      key,
      children,
    }
  })
}

function createChapterIndex(items: NavItem[]): ChapterIndex {
  const hrefByKey: Record<string, string> = {}
  const labelByKey: Record<string, string> = {}
  const openKeys: string[] = []
  const hrefEntries: Array<{ href: string; key: string }> = []

  const nodes = toChapterNodes(items)

  const menuItems = nodes.map(function mapNode(node): NonNullable<MenuProps['items']>[number] {
    labelByKey[node.key] = node.label
    hrefByKey[node.key] = node.href
    hrefEntries.push({ href: normalizeHref(node.href), key: node.key })

    if (node.children?.length) {
      openKeys.push(node.key)
    }

    return {
      key: node.key,
      label: node.label,
      children: node.children?.map(mapNode),
    }
  })

  hrefEntries.sort((left, right) => right.href.length - left.href.length)

  return {
    items: menuItems,
    hrefByKey,
    labelByKey,
    openKeys,
    hrefEntries,
  }
}

function findChapterKey(href: string, chapterIndex: ChapterIndex) {
  const normalizedHref = normalizeHref(href)
  const match = chapterIndex.hrefEntries.find((entry) => {
    return normalizedHref === entry.href || normalizedHref.startsWith(entry.href)
  })

  return match?.key
}

async function buildFallbackChapters(book: Book): Promise<NavItem[]> {
  const spineItems = await book.loaded.spine.catch(() => [])

  return spineItems.reduce<NavItem[]>((entries, item, index) => {
    if (typeof item.href !== 'string' || item.href.length === 0) {
      return entries
    }

    entries.push({
      id: `spine-${index}`,
      href: item.href,
      label: `Chapter ${index + 1}`,
    })

    return entries
  }, [])
}

const MOBILE_BREAKPOINT = '(max-width: 960px)'

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia(MOBILE_BREAKPOINT).matches,
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_BREAKPOINT)
    const handler = (event: MediaQueryListEvent) => setIsMobile(event.matches)

    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  return isMobile
}

function App() {
  const isMobile = useIsMobile()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const viewerRef = useRef<HTMLDivElement | null>(null)
  const bookRef = useRef<Book | null>(null)
  const activeSectionRef = useRef<{ unload: () => void } | null>(null)
  const loadRequestRef = useRef(0)

  const [bookMeta, setBookMeta] = useState<BookMeta | null>(null)
  const [fileName, setFileName] = useState('')
  const [chapters, setChapters] = useState<NavItem[]>([])
  const [selectedKey, setSelectedKey] = useState<string>()
  const [openKeys, setOpenKeys] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const chapterIndex = useMemo(() => createChapterIndex(chapters), [chapters])
  const destroyBook = useCallback(() => {
    activeSectionRef.current?.unload()
    activeSectionRef.current = null
    bookRef.current?.destroy()
    bookRef.current = null

    if (viewerRef.current) {
      viewerRef.current.innerHTML = ''
    }
  }, [])

  useEffect(() => {
    return () => {
      destroyBook()
    }
  }, [destroyBook])

  const scrollToFragment = useCallback((fragmentId: string) => {
    const mount = viewerRef.current

    if (!mount) {
      return false
    }

    const escapedFragmentId = typeof CSS.escape === 'function'
      ? CSS.escape(fragmentId)
      : fragmentId

    const directMatch = mount.querySelector(`#${escapedFragmentId}`)
    const attributeMatch = mount.querySelector(`[id="${fragmentId.replaceAll('"', '\\"')}"]`)
    const namedMatch = mount.querySelector(`[name="${fragmentId.replaceAll('"', '\\"')}"]`)
    const sectionElement = (directMatch || attributeMatch || namedMatch) as HTMLElement | null

    if (!sectionElement) {
      return false
    }

    const nextTop = window.scrollY + sectionElement.getBoundingClientRect().top - 12
    window.scrollTo({ top: Math.max(0, nextTop), behavior: 'auto' })

    return true
  }, [])

  const renderChapter = useCallback(
    async (href: string, chapterKey?: string, fragmentId?: string): Promise<boolean> => {
      if (!bookRef.current || !viewerRef.current) {
        return false
      }

      const targetBook = bookRef.current
      const targetSection = targetBook.section(href)

      if (!targetSection) {
        return false
      }

      setErrorMessage('')
      setIsLoading(true)

      try {
        const renderedMarkup = await Promise.resolve(
          targetSection.render(targetBook.load.bind(targetBook)),
        )

        if (!viewerRef.current || targetBook !== bookRef.current) {
          targetSection.unload()
          return false
        }

        // const parsedDocument = new DOMParser().parseFromString(renderedMarkup, 'text/html')
        viewerRef.current.innerHTML = `<article class="reader-inline-root">${renderedMarkup}</article>`

        const article = viewerRef.current.querySelector('.reader-inline-root') as HTMLElement
        rewriteInternalLinks(article, targetSection.href || href)
        await rewriteResources(article, targetBook, targetSection.url || href)
        const preTags = article.querySelectorAll('pre')
        
        preTags.forEach((pre) => {
          pre.setAttribute('aria-hidden', 'true')
        })

        activeSectionRef.current?.unload()
        activeSectionRef.current = targetSection

        if (chapterKey) {
          setSelectedKey(chapterKey)
        }

        requestAnimationFrame(() => {
          if (fragmentId && scrollToFragment(fragmentId)) {
            return
          }

          window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
        })

        return true
      } catch (error) {
        targetSection.unload()
        setErrorMessage(
          error instanceof Error ? error.message : 'Unable to render this chapter. Please try another one.',
        )
        return false
      } finally {
        if (targetBook === bookRef.current) {
          setIsLoading(false)
        }
      }
    },
    [scrollToFragment],
  )

  const loadBook = useCallback(
    async (file: File) => {
      const requestId = loadRequestRef.current + 1
      loadRequestRef.current = requestId

      setIsLoading(true)
      setErrorMessage('')
      setSelectedKey(undefined)
      setBookMeta(null)
      setFileName(file.name)
      destroyBook()

      try {
        const arrayBuffer = await file.arrayBuffer()
        const nextBook = ePub(arrayBuffer)

        bookRef.current = nextBook
        await nextBook.ready

        if (loadRequestRef.current !== requestId) {
          nextBook.destroy()
          return
        }

        const [metadata, navigation] = await Promise.all([
          nextBook.loaded.metadata.catch(() => null),
          nextBook.loaded.navigation.catch(() => null),
        ])

        const nextChapters = navigation?.toc?.length
          ? navigation.toc
          : await buildFallbackChapters(nextBook)

        const nextChapterIndex = createChapterIndex(nextChapters)

        setChapters(nextChapters)
        setOpenKeys([])
        setBookMeta({
          title: metadata?.title?.trim() || file.name.replace(/\.epub$/i, ''),
          creator: metadata?.creator?.trim() || 'Unknown author',
        })

        if (!viewerRef.current) {
          throw new Error('Reader container is not available.')
        }

        let rendered = false

        for (const ch of nextChapters) {
          if (!ch.href) continue
          const [chapterHref, fragmentId] = ch.href.split('#')
          const key = findChapterKey(ch.href, nextChapterIndex)
          rendered = await renderChapter(chapterHref || ch.href, key, fragmentId)
          if (rendered) break
        }

        if (!rendered) {
          const spineItems = await nextBook.loaded.spine.catch(() => [])
          for (const item of spineItems) {
            if (typeof item.href !== 'string' || item.href.length === 0) continue
            const key = findChapterKey(item.href, nextChapterIndex)
            rendered = await renderChapter(item.href, key)
            if (rendered) break
          }
        }

        if (!rendered && nextChapterIndex.items?.length) {
          setSelectedKey((nextChapterIndex.items[0] as { key: string }).key)
        }
      } catch (error) {
        destroyBook()
        setChapters([])
        setOpenKeys([])
        setBookMeta(null)
        setSelectedKey(undefined)
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Unable to open this EPUB file. Please try another book.',
        )
      } finally {
        if (loadRequestRef.current === requestId) {
          setIsLoading(false)
        }
      }
    },
    [destroyBook, renderChapter],
  )

  const uploadProps: UploadProps = {
    accept: '.epub,application/epub+zip',
    maxCount: 1,
    showUploadList: false,
    beforeUpload: (file) => {
      void loadBook(file)
      return false
    },
  }

  const handleChapterClick: MenuProps['onClick'] = ({ key }) => {
    const href = chapterIndex.hrefByKey[key]

    if (!href) {
      return
    }
    const [chapterHref, fragmentId] = href.split('#')
    void renderChapter(chapterHref || href, key, fragmentId)
    if (isMobile) {
      setDrawerOpen(false)
    }
  }

  useEffect(() => {
    const mount = viewerRef.current

    if (!mount) {
      return
    }

    const onLinkClick = (event: MouseEvent) => {
      const target = event.target

      if (!(target instanceof Element)) {
        return
      }

      const anchor = target.closest('a[data-epub-href]')

      if (!(anchor instanceof HTMLAnchorElement)) {
        return
      }

      const targetHref = anchor.getAttribute('data-epub-href')

      if (!targetHref || !bookRef.current) {
        return
      }

      event.preventDefault()

      const [chapterTargetHref, fragmentId] = targetHref.split('#')

      const nextKey = findChapterKey(targetHref, chapterIndex)

      if (!nextKey) {
        return
      }

      const nextChapterHref = chapterIndex.hrefByKey[nextKey]

      if (!nextChapterHref) {
        return
      }

      if (nextKey === selectedKey && fragmentId) {
        requestAnimationFrame(() => {
          if (scrollToFragment(fragmentId)) {
            return
          }

          window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
        })

        return
      }

      const renderHref = chapterTargetHref || nextChapterHref
      void renderChapter(renderHref, nextKey, fragmentId)
    }

    mount.addEventListener('click', onLinkClick)

    return () => {
      mount.removeEventListener('click', onLinkClick)
    }
  }, [chapterIndex, renderChapter, scrollToFragment, selectedKey])

  const sidebarContent = (
    <>
      <div className="reader-control" style={{ display: 'flex', padding: '5px', justifyContent: 'end' }}>
        <Upload {...uploadProps}>
          <Button type="primary" size="medium" shape="square" className="reader-menubar__button">
            Upload
          </Button>
        </Upload>
      </div>
      {chapters.length ? (
        <Menu
          mode="inline"
          items={chapterIndex.items}
          selectedKeys={selectedKey ? [selectedKey] : []}
          openKeys={openKeys}
          onOpenChange={(keys) => {
            setOpenKeys(keys)
            const newKey = keys.find((k) => !openKeys.includes(k))
            if (newKey) {
              const href = chapterIndex.hrefByKey[newKey]
              if (href) {
                const [chapterHref, fragmentId] = href.split('#')
                void renderChapter(chapterHref || href, newKey, fragmentId)
                if (isMobile) {
                  setDrawerOpen(false)
                }
              }
            }
          }}
          onClick={handleChapterClick}
          className="reader-menu"
        />
      ) : (
        <div className="reader-sidebar__empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No table of contents yet"
          />
        </div>
      )}
    </>
  )

  return (
    <Layout className="reader-layout">
      {isMobile ? (
        <>
          <Button
            className="reader-hamburger"
            type="text"
            icon={<MenuOutlined />}
            onClick={() => setDrawerOpen(true)}
            aria-label="Open table of contents"
          />
          <Drawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            placement="left"
            width={300}
            className="reader-drawer"
            styles={{ body: { padding: 0 } }}
          >
            {sidebarContent}
          </Drawer>
        </>
      ) : (
        <Sider className="reader-sidebar" theme="light" aria-hidden="true" width={300}>
          {sidebarContent}
        </Sider>
      )}

      <Content className="reader-content">
        <Card className="reader-stage " bordered={false}>
          {errorMessage ? (
            <Alert
              className="reader-alert"
              message="Could not load EPUB"
              description={errorMessage}
              type="error"
              showIcon
            />
          ) : null}
          <div className={`reader-viewer ${isLoading ? 'reader-viewer--loading' : ''}`}>
            <div ref={viewerRef} className="reader-viewer__mount" />

            {!bookMeta && !isLoading ? (
              <div className="reader-placeholder">
                <Empty description="Upload an EPUB from the top menu to start reading" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              </div>
            ) : null}

            {isLoading ? (
              <div className="reader-loading">
                <Card bordered={false}>
                  <Space direction="vertical" size={8}>
                    <Text strong>Opening {fileName || 'book'}...</Text>
                    <Text type="secondary">Parsing the package, chapters, and reading order.</Text>
                  </Space>
                </Card>
              </div>
            ) : null}
          </div>
        </Card>
      </Content>
    </Layout>
  )
}

export default App
