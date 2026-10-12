# DevLoadable

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20+-blue.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

**DevLoadable** is an open-source, production-grade AI-powered web application builder. It enables users to describe their application ideas in natural language and generates complete, deployable code with real-time preview, chat-based iteration, and one-click publishing.

Inspired by tools like Lovable, Bolt.new, and Emergent, DevLoadable provides a fully customizable alternative that you can self-host and extend.

---

## Features

- **Natural Language Code Generation** - Describe your app, and DevLoadable generates production-ready code
- **Real-time Preview** - See changes instantly in an embedded browser preview
- **Chat-based Iteration** - Refine your application through conversation with the AI agent
- **Multi-stack Support** - Works with TypeScript, React, Vue, Svelte, Python, PHP, Go, Rust, and more
- **Custom API Integration** - Support for multiple LLM providers (Groq, Gemini, OpenRouter, DeepSeek, etc.)
- **Authentication & User Management** - Built-in Supabase authentication with admin panel
- **File Upload** - Upload reference files and designs to guide code generation
- **Export & Publish** - Download generated code as ZIP or publish with custom links

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | [TanStack Start](https://tanstack.com/start) |
| UI | [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) |
| Styling | [Tailwind CSS](https://tailwindcss.com/) |
| Authentication | [Supabase](https://supabase.com/) |
| AI Engine | Custom LLM interface (supports multiple providers) |
| Build | [Vite](https://vitejs.dev/) + [Nitro](https://nitro.unjs.io/) |

---

## Prerequisites

- **Node.js** 20 or higher
- **npm** or **pnpm**
- **Supabase** account (for authentication and database)

---

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/devloadable.git
cd devloadable

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
```

---

## Environment Configuration

Create a `.env` file in the root directory:

```env
# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# AI Engine Configuration
INCEPTION_API_KEY=your_api_key

# Key Encryption (for storing API keys securely)
KEY_ENCRYPTION_SECRET=your_random_32_character_secret
```

### Optional: Multiple AI Providers

To use additional LLM providers:

```env
GROQ_API_KEY=your_groq_key
GEMINI_API_KEY=your_gemini_key
OPENROUTER_API_KEY=your_openrouter_key
```

---

## Development

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start preview server
npm run preview

# Run type checking
npm run typecheck

# Run linting
npm run lint
```

---

## Project Structure

```
devloadable/
├── src/
│   ├── components/          # React components
│   │   ├── brand/          # Branding components
│   │   ├── builder/        # Builder UI components
│   │   └── ui/             # Shared UI components
│   ├── integrations/
│   │   └── supabase/       # Supabase client & auth
│   ├── lib/
│   │   ├── agent-parser.server.ts    # Agent response parser
│   │   ├── agent-provider.server.ts  # Model provider interface
│   │   └── engine.server.ts          # LLM engine configuration
│   └── routes/             # TanStack Router routes
├── public/                  # Static assets
├── .env.example             # Environment template
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Usage

### 1. Start a New Project

After authentication, use the chat panel to describe what you want to build:

> "Create a portfolio website with a dark theme, project showcase section, and contact form"

### 2. Iterate Through Chat

Refine your application through conversation:

> "Add a testimonials section with three sample reviews"
> "Change the color scheme to purple"
> "Export the code so I can deploy it locally"

### 3. Upload Reference Files

Attach design mockups, existing code, or documentation to guide the AI's output.

### 4. Publish or Export

- **Publish**: Deploy with a custom subdomain
- **Export**: Download the complete codebase as a ZIP file

---

## Features Roadmap

- [ ] Code generation with multiple LLM providers
- [ ] File upload for reference materials
- [ ] Custom API key management
- [ ] Admin panel for user management
- [ ] Export to ZIP
- [ ] Custom domain publishing

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Credits

Built with inspiration from:
- [Lovable](https://lovable.dev)
- [Google Ai Studio](https://aistudio.google.com)
- [Claude](https://claude.ai)

---

## Support

For issues, questions, or feature requests, please open a GitHub Issue.
