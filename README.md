
# Epub reading app

A EPUB reader built with React 19, TypeScript, Vite, and Ant Design.  
This project allows users to upload and read EPUB files directly in the browser, with a clean interface and responsive design. Easy to use with browser read aloud feature in Edge,...

## Features

- **EPUB Upload & Parsing**: Upload `.epub` files and render their content instantly.
- **Table of Contents Navigation**: Browse chapters via a sidebar menu.
- **Internal Link Handling**: Clickable links within the book for seamless navigation.
- **Resource Rewriting**: Images and media are loaded from the EPUB archive.
- **Responsive UI**: Clean layout using Ant Design components.
- **Graceful Error Handling**: User-friendly messages for unsupported or broken files.

## Tech Stack

- **React 19** (functional components, hooks)
- **TypeScript** (strict mode)
- **Vite 8** (fast dev/build)
- **Ant Design** (UI components)
- **epubjs** (EPUB parsing/rendering)

## Getting Started

### Development

```sh
pnpm install
pnpm run dev
```

### Build

```sh
pnpm run build
```

## Usage

1. Click the **Upload** button in the sidebar.
2. Select an `.epub` file from your computer.
3. Navigate chapters using the sidebar menu.
4. Click internal links to jump within the book.

## Project Structure

- `src/App.tsx` — Main application logic and UI
- `src/main.tsx` — App entry point
- `src/App.css` — App-specific styles
- `public/` — Static assets

## Notes

- Only EPUB files are supported.
- For best results, use a modern browser.

## License

MIT
