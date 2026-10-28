# Rillio Quickstart Example Project

This is a standalone, real-world example application built with **[`@vyquocvu/rillio`](https://www.npmjs.com/package/@vyquocvu/rillio)** installed directly from npm.

## 🚀 Getting Started

### 1. Install dependencies

```sh
npm install
```

### 2. Run the development server

```sh
npm run dev
```

Open `http://localhost:3000/` in your browser.

### 3. Build for production

```sh
npm run build
npm run preview
```

## 📁 Project Structure

```
quickstart/
├── index.html        # HTML entry point
├── package.json      # Dependencies and scripts (@vyquocvu/rillio from npm)
├── tsconfig.json     # TypeScript config with JSX runtime (@vyquocvu/rillio)
├── vite.config.ts    # Vite bundler configuration
└── src/
    ├── main.tsx      # Application root mounting with createRoot
    ├── App.tsx       # Counter and keyed task list component
    └── style.css     # Clean modern CSS styling
```

## ⚛️ TypeScript & JSX Configuration

In `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@vyquocvu/rillio"
  }
}
```
