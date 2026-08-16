/**
 * Markdown CSS Themes library inspired by jasonm23/markdown-css-themes
 * Provides distinct CSS themes for rendering Markdown HTML.
 */

export interface MarkdownTheme {
  id: string;
  name: string;
  description: string;
  mode: 'light' | 'dark' | 'sepia';
  bg: string;
  fg: string;
  accent: string;
  fontFamily: string;
  css: string;
}

export const MARKDOWN_THEMES: MarkdownTheme[] = [
  {
    id: 'github-light',
    name: 'GitHub Light',
    description: 'The standard clean white GitHub markdown theme',
    mode: 'light',
    bg: '#ffffff',
    fg: '#24292f',
    accent: '#0969da',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    css: `
      .markdown-theme-github-light {
        background-color: #ffffff;
        color: #24292f;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
        font-size: 15px;
        line-height: 1.6;
        padding: 24px;
        border-radius: 8px;
      }
      .markdown-theme-github-light h1,
      .markdown-theme-github-light h2,
      .markdown-theme-github-light h3,
      .markdown-theme-github-light h4,
      .markdown-theme-github-light h5,
      .markdown-theme-github-light h6 {
        color: #1F2328;
        font-weight: 600;
        margin-top: 24px;
        margin-bottom: 16px;
        line-height: 1.25;
      }
      .markdown-theme-github-light h1 { font-size: 2em; border-bottom: 1px solid #hsla(210,18%,87%,1); padding-bottom: 0.3em; border-bottom: 1px solid #d0d7de; }
      .markdown-theme-github-light h2 { font-size: 1.5em; border-bottom: 1px solid #d0d7de; padding-bottom: 0.3em; }
      .markdown-theme-github-light a { color: #0969da; text-decoration: none; }
      .markdown-theme-github-light a:hover { text-decoration: underline; }
      .markdown-theme-github-light code { background-color: rgba(175,184,193,0.2); border-radius: 6px; padding: 0.2em 0.4em; font-size: 85%; font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace; }
      .markdown-theme-github-light pre { background-color: #f6f8fa; border-radius: 6px; padding: 16px; overflow: auto; line-height: 1.45; }
      .markdown-theme-github-light pre code { background-color: transparent; padding: 0; }
      .markdown-theme-github-light blockquote { border-left: 0.25em solid #d0d7de; color: #57606a; padding: 0 1em; margin: 16px 0; }
      .markdown-theme-github-light table { border-collapse: collapse; width: 100%; margin: 16px 0; }
      .markdown-theme-github-light table th, .markdown-theme-github-light table td { border: 1px solid #d0d7de; padding: 6px 13px; }
      .markdown-theme-github-light table tr:nth-child(2n) { background-color: #f6f8fa; }
      .markdown-theme-github-light hr { height: 0.25em; padding: 0; margin: 24px 0; background-color: #d0d7de; border: 0; }
    `
  },
  {
    id: 'github-dark',
    name: 'GitHub Dark',
    description: 'Official GitHub dark mode editor theme',
    mode: 'dark',
    bg: '#0d1117',
    fg: '#c9d1d9',
    accent: '#58a6ff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    css: `
      .markdown-theme-github-dark {
        background-color: #0d1117;
        color: #c9d1d9;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
        font-size: 15px;
        line-height: 1.6;
        padding: 24px;
        border-radius: 8px;
      }
      .markdown-theme-github-dark h1,
      .markdown-theme-github-dark h2,
      .markdown-theme-github-dark h3,
      .markdown-theme-github-dark h4,
      .markdown-theme-github-dark h5,
      .markdown-theme-github-dark h6 {
        color: #f0f6fc;
        font-weight: 600;
        margin-top: 24px;
        margin-bottom: 16px;
        line-height: 1.25;
      }
      .markdown-theme-github-dark h1 { font-size: 2em; border-bottom: 1px solid #21262d; padding-bottom: 0.3em; }
      .markdown-theme-github-dark h2 { font-size: 1.5em; border-bottom: 1px solid #21262d; padding-bottom: 0.3em; }
      .markdown-theme-github-dark a { color: #58a6ff; text-decoration: none; }
      .markdown-theme-github-dark a:hover { text-decoration: underline; }
      .markdown-theme-github-dark code { background-color: rgba(110,118,129,0.4); border-radius: 6px; padding: 0.2em 0.4em; font-size: 85%; font-family: ui-monospace, SFMono-Regular, monospace; }
      .markdown-theme-github-dark pre { background-color: #161b22; border-radius: 6px; padding: 16px; overflow: auto; line-height: 1.45; border: 1px solid #30363d; }
      .markdown-theme-github-dark pre code { background-color: transparent; padding: 0; }
      .markdown-theme-github-dark blockquote { border-left: 0.25em solid #30363d; color: #8b949e; padding: 0 1em; margin: 16px 0; }
      .markdown-theme-github-dark table { border-collapse: collapse; width: 100%; margin: 16px 0; }
      .markdown-theme-github-dark table th, .markdown-theme-github-dark table td { border: 1px solid #30363d; padding: 6px 13px; }
      .markdown-theme-github-dark table tr:nth-child(2n) { background-color: #161b22; }
      .markdown-theme-github-dark hr { height: 0.25em; padding: 0; margin: 24px 0; background-color: #21262d; border: 0; }
    `
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    description: 'Ethan Schoonover’s classic warm Solarized Light palette',
    mode: 'light',
    bg: '#fdf6e3',
    fg: '#657b83',
    accent: '#268bd2',
    fontFamily: '"PT Serif", Georgia, Cambria, "Times New Roman", Times, serif',
    css: `
      .markdown-theme-solarized-light {
        background-color: #fdf6e3;
        color: #657b83;
        font-family: "PT Serif", Georgia, Cambria, serif;
        font-size: 16px;
        line-height: 1.65;
        padding: 28px;
        border-radius: 8px;
      }
      .markdown-theme-solarized-light h1,
      .markdown-theme-solarized-light h2,
      .markdown-theme-solarized-light h3,
      .markdown-theme-solarized-light h4 {
        color: #b58900;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-weight: 700;
        margin-top: 24px;
        margin-bottom: 12px;
      }
      .markdown-theme-solarized-light h1 { font-size: 2.1em; color: #cb4b16; border-bottom: 2px solid #eee8d5; padding-bottom: 6px; }
      .markdown-theme-solarized-light h2 { font-size: 1.6em; color: #268bd2; border-bottom: 1px solid #eee8d5; padding-bottom: 4px; }
      .markdown-theme-solarized-light a { color: #2aa198; text-decoration: none; border-bottom: 1px dotted #2aa198; }
      .markdown-theme-solarized-light a:hover { color: #268bd2; border-bottom-style: solid; }
      .markdown-theme-solarized-light code { background-color: #eee8d5; color: #d33682; border-radius: 4px; padding: 2px 6px; font-family: "Courier New", Courier, monospace; font-size: 0.9em; }
      .markdown-theme-solarized-light pre { background-color: #eee8d5; color: #073642; border-radius: 6px; padding: 16px; overflow-x: auto; border-left: 4px solid #268bd2; }
      .markdown-theme-solarized-light pre code { background-color: transparent; color: inherit; padding: 0; }
      .markdown-theme-solarized-light blockquote { border-left: 4px solid #b58900; color: #839496; padding-left: 16px; font-style: italic; margin: 16px 0; }
      .markdown-theme-solarized-light table { border-collapse: collapse; width: 100%; margin: 18px 0; }
      .markdown-theme-solarized-light table th { background-color: #eee8d5; color: #073642; border: 1px solid #93a1a1; padding: 8px 12px; }
      .markdown-theme-solarized-light table td { border: 1px solid #eee8d5; padding: 8px 12px; }
      .markdown-theme-solarized-light hr { border: 0; height: 1px; background: #93a1a1; margin: 24px 0; }
    `
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    description: 'Solarized dark blue canvas with vibrant accent colors',
    mode: 'dark',
    bg: '#002b36',
    fg: '#839496',
    accent: '#b58900',
    fontFamily: '"PT Serif", Georgia, serif',
    css: `
      .markdown-theme-solarized-dark {
        background-color: #002b36;
        color: #839496;
        font-family: "PT Serif", Georgia, serif;
        font-size: 16px;
        line-height: 1.65;
        padding: 28px;
        border-radius: 8px;
      }
      .markdown-theme-solarized-dark h1,
      .markdown-theme-solarized-dark h2,
      .markdown-theme-solarized-dark h3 {
        font-family: -apple-system, sans-serif;
        font-weight: 700;
        margin-top: 24px;
        margin-bottom: 12px;
      }
      .markdown-theme-solarized-dark h1 { font-size: 2.1em; color: #b58900; border-bottom: 2px solid #073642; padding-bottom: 6px; }
      .markdown-theme-solarized-dark h2 { font-size: 1.6em; color: #268bd2; border-bottom: 1px solid #073642; padding-bottom: 4px; }
      .markdown-theme-solarized-dark h3 { font-size: 1.3em; color: #2aa198; }
      .markdown-theme-solarized-dark a { color: #2aa198; text-decoration: none; border-bottom: 1px dotted #2aa198; }
      .markdown-theme-solarized-dark code { background-color: #073642; color: #cb4b16; border-radius: 4px; padding: 2px 6px; font-family: monospace; }
      .markdown-theme-solarized-dark pre { background-color: #073642; color: #93a1a1; border-radius: 6px; padding: 16px; overflow-x: auto; border-left: 4px solid #b58900; }
      .markdown-theme-solarized-dark pre code { background-color: transparent; color: inherit; padding: 0; }
      .markdown-theme-solarized-dark blockquote { border-left: 4px solid #cb4b16; color: #657b83; padding-left: 16px; font-style: italic; }
      .markdown-theme-solarized-dark table { border-collapse: collapse; width: 100%; margin: 18px 0; }
      .markdown-theme-solarized-dark table th { background-color: #073642; color: #fdf6e3; border: 1px solid #586e75; padding: 8px 12px; }
      .markdown-theme-solarized-dark table td { border: 1px solid #073642; padding: 8px 12px; }
      .markdown-theme-solarized-dark hr { border: 0; height: 1px; background: #586e75; margin: 24px 0; }
    `
  },
  {
    id: 'swiss-clean',
    name: 'Swiss / Typora',
    description: 'Swiss typographic minimalist layout with crisp typography',
    mode: 'light',
    bg: '#fcfcfc',
    fg: '#111111',
    accent: '#000000',
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    css: `
      .markdown-theme-swiss-clean {
        background-color: #fcfcfc;
        color: #111111;
        font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
        font-size: 15px;
        line-height: 1.7;
        padding: 32px;
        border-radius: 8px;
        max-width: 100%;
      }
      .markdown-theme-swiss-clean h1,
      .markdown-theme-swiss-clean h2,
      .markdown-theme-swiss-clean h3 {
        color: #000000;
        font-weight: 700;
        letter-spacing: -0.02em;
        margin-top: 28px;
        margin-bottom: 12px;
      }
      .markdown-theme-swiss-clean h1 { font-size: 2.2em; border-bottom: 3px solid #000; padding-bottom: 8px; text-transform: uppercase; letter-spacing: -0.03em; }
      .markdown-theme-swiss-clean h2 { font-size: 1.5em; border-bottom: 1px solid #000; padding-bottom: 4px; }
      .markdown-theme-swiss-clean a { color: #000000; text-decoration: underline; text-underline-offset: 3px; font-weight: 500; }
      .markdown-theme-swiss-clean code { background-color: #f1f1f1; border-radius: 2px; padding: 2px 5px; font-family: "Courier New", monospace; font-size: 0.88em; }
      .markdown-theme-swiss-clean pre { background-color: #111111; color: #ffffff; border-radius: 4px; padding: 18px; overflow-x: auto; }
      .markdown-theme-swiss-clean pre code { background-color: transparent; color: inherit; padding: 0; }
      .markdown-theme-swiss-clean blockquote { border-left: 4px solid #000000; padding-left: 16px; margin: 20px 0; font-weight: 500; color: #444444; }
      .markdown-theme-swiss-clean table { border-collapse: collapse; width: 100%; margin: 20px 0; }
      .markdown-theme-swiss-clean table th { text-align: left; border-bottom: 2px solid #000000; padding: 8px 12px; font-weight: 700; }
      .markdown-theme-swiss-clean table td { border-bottom: 1px solid #e5e5e5; padding: 8px 12px; }
      .markdown-theme-swiss-clean hr { border: 0; border-top: 2px solid #000000; margin: 30px 0; }
    `
  },
  {
    id: 'academic-scholarly',
    name: 'Scholarly / LaTeX',
    description: 'Academic paper publication layout with serif typography & double-ruled tables',
    mode: 'light',
    bg: '#ffffff',
    fg: '#111111',
    accent: '#800000',
    fontFamily: '"Times New Roman", Times, "Computer Modern", Georgia, serif',
    css: `
      .markdown-theme-academic-scholarly {
        background-color: #ffffff;
        color: #111111;
        font-family: "Times New Roman", Times, "Computer Modern", Georgia, serif;
        font-size: 16px;
        line-height: 1.75;
        padding: 36px;
        border-radius: 8px;
      }
      .markdown-theme-academic-scholarly h1,
      .markdown-theme-academic-scholarly h2,
      .markdown-theme-academic-scholarly h3,
      .markdown-theme-academic-scholarly h4 {
        color: #000000;
        font-family: "Times New Roman", Times, serif;
        font-weight: bold;
        margin-top: 28px;
        margin-bottom: 14px;
        text-align: left;
      }
      .markdown-theme-academic-scholarly h1 { font-size: 1.8em; text-align: center; margin-bottom: 24px; border-bottom: 1px solid #000; padding-bottom: 12px; }
      .markdown-theme-academic-scholarly h2 { font-size: 1.4em; border-bottom: 1px solid #333; padding-bottom: 4px; }
      .markdown-theme-academic-scholarly h3 { font-size: 1.15em; font-style: italic; }
      .markdown-theme-academic-scholarly a { color: #800000; text-decoration: none; }
      .markdown-theme-academic-scholarly a:hover { text-decoration: underline; }
      .markdown-theme-academic-scholarly code { font-family: "Courier New", Courier, monospace; background: #f8f9fa; border: 1px solid #eaecf0; padding: 2px 4px; font-size: 0.9em; }
      .markdown-theme-academic-scholarly pre { background-color: #f8f9fa; border: 1px solid #d0d7de; padding: 14px; overflow-x: auto; border-radius: 2px; }
      .markdown-theme-academic-scholarly pre code { border: none; padding: 0; background: transparent; }
      .markdown-theme-academic-scholarly blockquote { border-left: 2px solid #800000; padding-left: 16px; margin: 18px 0; font-style: italic; color: #333333; }
      .markdown-theme-academic-scholarly table { border-collapse: collapse; width: 100%; margin: 24px 0; border-top: 2px solid #000000; border-bottom: 2px solid #000000; }
      .markdown-theme-academic-scholarly table th { border-bottom: 1px solid #000000; padding: 8px; font-weight: bold; text-align: left; }
      .markdown-theme-academic-scholarly table td { padding: 8px; border-bottom: 1px solid #e0e0e0; }
      .markdown-theme-academic-scholarly hr { border: 0; border-top: 1px solid #000000; margin: 28px 0; }
      .markdown-theme-academic-scholarly .math-block { background: #fdfdfd !important; color: #000000 !important; border: 1px solid #e0e0e0 !important; }
    `
  },
  {
    id: 'gothic-dracula',
    name: 'Gothic / Dracula',
    description: 'Vibrant dark gothic theme with purple & cyan highlights',
    mode: 'dark',
    bg: '#282a36',
    fg: '#f8f8f2',
    accent: '#bd93f9',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    css: `
      .markdown-theme-gothic-dracula {
        background-color: #282a36;
        color: #f8f8f2;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 15px;
        line-height: 1.65;
        padding: 28px;
        border-radius: 8px;
      }
      .markdown-theme-gothic-dracula h1,
      .markdown-theme-gothic-dracula h2,
      .markdown-theme-gothic-dracula h3 {
        color: #bd93f9;
        font-weight: 700;
        margin-top: 24px;
        margin-bottom: 12px;
      }
      .markdown-theme-gothic-dracula h1 { font-size: 2em; color: #ff79c6; border-bottom: 2px solid #44475a; padding-bottom: 6px; }
      .markdown-theme-gothic-dracula h2 { font-size: 1.5em; color: #8be9fd; border-bottom: 1px solid #44475a; padding-bottom: 4px; }
      .markdown-theme-gothic-dracula a { color: #50fa7b; text-decoration: none; }
      .markdown-theme-gothic-dracula a:hover { text-decoration: underline; }
      .markdown-theme-gothic-dracula code { background-color: #44475a; color: #f1fa8c; border-radius: 4px; padding: 2px 6px; font-family: monospace; }
      .markdown-theme-gothic-dracula pre { background-color: #1e1f29; color: #f8f8f2; border-radius: 8px; padding: 16px; border: 1px solid #44475a; overflow-x: auto; }
      .markdown-theme-gothic-dracula pre code { background-color: transparent; padding: 0; }
      .markdown-theme-gothic-dracula blockquote { border-left: 4px solid #bd93f9; color: #6272a4; padding-left: 16px; margin: 16px 0; }
      .markdown-theme-gothic-dracula table { border-collapse: collapse; width: 100%; margin: 20px 0; }
      .markdown-theme-gothic-dracula table th { background-color: #44475a; color: #ff79c6; border: 1px solid #6272a4; padding: 8px 12px; }
      .markdown-theme-gothic-dracula table td { border: 1px solid #44475a; padding: 8px 12px; }
      .markdown-theme-gothic-dracula hr { border: 0; height: 2px; background: #44475a; margin: 24px 0; }
    `
  },
  {
    id: 'retro-sepia',
    name: 'Retro Sepia',
    description: 'Warm vintage sepia background with Garamond serif text',
    mode: 'sepia',
    bg: '#f4ecd8',
    fg: '#3c2f2f',
    accent: '#8b4513',
    fontFamily: 'Garamond, "Hoefler Text", Palatino, serif',
    css: `
      .markdown-theme-retro-sepia {
        background-color: #f4ecd8;
        color: #3c2f2f;
        font-family: Garamond, "Hoefler Text", Palatino, serif;
        font-size: 17px;
        line-height: 1.7;
        padding: 32px;
        border-radius: 8px;
      }
      .markdown-theme-retro-sepia h1,
      .markdown-theme-retro-sepia h2,
      .markdown-theme-retro-sepia h3 {
        color: #8b4513;
        font-weight: bold;
        margin-top: 26px;
        margin-bottom: 12px;
      }
      .markdown-theme-retro-sepia h1 { font-size: 2.1em; border-bottom: 2px solid #d4c5a9; padding-bottom: 6px; }
      .markdown-theme-retro-sepia h2 { font-size: 1.5em; border-bottom: 1px solid #d4c5a9; padding-bottom: 4px; }
      .markdown-theme-retro-sepia a { color: #a0522d; text-decoration: underline; }
      .markdown-theme-retro-sepia code { background-color: #e6dac3; color: #5c2c2c; border-radius: 3px; padding: 2px 5px; font-family: "Courier New", monospace; font-size: 0.9em; }
      .markdown-theme-retro-sepia pre { background-color: #e6dac3; color: #2b1d1d; border-radius: 6px; padding: 16px; border: 1px solid #d4c5a9; overflow-x: auto; }
      .markdown-theme-retro-sepia pre code { background-color: transparent; padding: 0; }
      .markdown-theme-retro-sepia blockquote { border-left: 4px solid #8b4513; color: #6e5849; padding-left: 16px; font-style: italic; margin: 18px 0; }
      .markdown-theme-retro-sepia table { border-collapse: collapse; width: 100%; margin: 20px 0; }
      .markdown-theme-retro-sepia table th { background-color: #e6dac3; color: #3c2f2f; border: 1px solid #c8b99c; padding: 8px 12px; }
      .markdown-theme-retro-sepia table td { border: 1px solid #e0d3b8; padding: 8px 12px; }
      .markdown-theme-retro-sepia hr { border: 0; height: 1px; background: #c8b99c; margin: 24px 0; }
    `
  },
  {
    id: 'clearness-minimal',
    name: 'Clearness Minimal',
    description: 'Ultra-clean borderless layout with ample whitespace',
    mode: 'light',
    bg: '#ffffff',
    fg: '#2c3e50',
    accent: '#3498db',
    fontFamily: '"Open Sans", "Segoe UI", sans-serif',
    css: `
      .markdown-theme-clearness-minimal {
        background-color: #ffffff;
        color: #2c3e50;
        font-family: "Open Sans", "Segoe UI", sans-serif;
        font-size: 15px;
        line-height: 1.8;
        padding: 32px;
        border-radius: 8px;
      }
      .markdown-theme-clearness-minimal h1,
      .markdown-theme-clearness-minimal h2,
      .markdown-theme-clearness-minimal h3 {
        color: #1a252f;
        font-weight: 300;
        margin-top: 30px;
        margin-bottom: 14px;
      }
      .markdown-theme-clearness-minimal h1 { font-size: 2.2em; color: #2c3e50; border-bottom: 1px solid #ecf0f1; padding-bottom: 8px; }
      .markdown-theme-clearness-minimal h2 { font-size: 1.6em; color: #34495e; border-bottom: 1px solid #ecf0f1; padding-bottom: 6px; }
      .markdown-theme-clearness-minimal a { color: #3498db; text-decoration: none; }
      .markdown-theme-clearness-minimal a:hover { text-decoration: underline; }
      .markdown-theme-clearness-minimal code { background-color: #f8f9fa; color: #e74c3c; border-radius: 4px; padding: 2px 6px; font-family: monospace; }
      .markdown-theme-clearness-minimal pre { background-color: #f8f9fa; border-radius: 8px; padding: 18px; border: 1px solid #eaeded; overflow-x: auto; }
      .markdown-theme-clearness-minimal pre code { background-color: transparent; padding: 0; color: #2c3e50; }
      .markdown-theme-clearness-minimal blockquote { border-left: 3px solid #3498db; color: #7f8c8d; padding-left: 16px; margin: 20px 0; }
      .markdown-theme-clearness-minimal table { border-collapse: collapse; width: 100%; margin: 20px 0; }
      .markdown-theme-clearness-minimal table th, .markdown-theme-clearness-minimal table td { border: 1px solid #ecf0f1; padding: 10px 14px; }
      .markdown-theme-clearness-minimal hr { border: 0; height: 1px; background: #ecf0f1; margin: 28px 0; }
    `
  },
  {
    id: 'modest-modern',
    name: 'Modest Modern',
    description: 'Modern indigo sans-serif layout with pill badges & clean borders',
    mode: 'light',
    bg: '#f8fafc',
    fg: '#334155',
    accent: '#4f46e5',
    fontFamily: '"Plus Jakarta Sans", -apple-system, sans-serif',
    css: `
      .markdown-theme-modest-modern {
        background-color: #f8fafc;
        color: #334155;
        font-family: "Plus Jakarta Sans", -apple-system, sans-serif;
        font-size: 15px;
        line-height: 1.7;
        padding: 28px;
        border-radius: 8px;
      }
      .markdown-theme-modest-modern h1,
      .markdown-theme-modest-modern h2,
      .markdown-theme-modest-modern h3 {
        color: #0f172a;
        font-weight: 700;
        margin-top: 26px;
        margin-bottom: 12px;
      }
      .markdown-theme-modest-modern h1 { font-size: 2em; color: #4f46e5; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
      .markdown-theme-modest-modern h2 { font-size: 1.5em; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
      .markdown-theme-modest-modern a { color: #4f46e5; font-weight: 600; text-decoration: none; }
      .markdown-theme-modest-modern a:hover { text-decoration: underline; }
      .markdown-theme-modest-modern code { background-color: #e0e7ff; color: #3730a3; border-radius: 6px; padding: 2px 6px; font-family: monospace; font-size: 0.88em; }
      .markdown-theme-modest-modern pre { background-color: #0f172a; color: #f8fafc; border-radius: 10px; padding: 18px; overflow-x: auto; }
      .markdown-theme-modest-modern pre code { background-color: transparent; color: inherit; padding: 0; }
      .markdown-theme-modest-modern blockquote { border-left: 4px solid #6366f1; background: #f1f5f9; padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 18px 0; }
      .markdown-theme-modest-modern table { border-collapse: collapse; width: 100%; margin: 20px 0; border-radius: 8px; overflow: hidden; }
      .markdown-theme-modest-modern table th { background-color: #e2e8f0; color: #0f172a; padding: 8px 12px; font-weight: 700; }
      .markdown-theme-modest-modern table td { border-bottom: 1px solid #e2e8f0; padding: 8px 12px; background: #ffffff; }
      .markdown-theme-modest-modern hr { border: 0; height: 2px; background: #e2e8f0; margin: 24px 0; }
    `
  }
];

export function getThemeById(id: string): MarkdownTheme {
  return MARKDOWN_THEMES.find((t) => t.id === id) || MARKDOWN_THEMES[0];
}

/**
 * Returns a <style> tag string containing the CSS rules for all themes
 */
export function getAllThemesCSS(): string {
  return MARKDOWN_THEMES.map((t) => t.css).join('\n');
}
