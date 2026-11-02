// Add providers here only alongside an authenticated, allowlisted server adapter.
export const AI_PROVIDERS = {
  openai: {
    label: "OpenAI (ChatGPT)",
    name: "OpenAI",
    keyURL: "https://platform.openai.com/api-keys",
    instructions:
      "Use a Restricted project API key with Responses → Write. API billing is required.",
  },
  claude: {
    label: "Anthropic Claude",
    name: "Claude",
    keyURL: "https://platform.claude.com/settings/keys",
    instructions:
      "Use a Claude API key with model access. API billing is separate from a Claude subscription.",
  },
  groq: {
    label: "Groq",
    name: "Groq",
    keyURL: "https://console.groq.com/keys",
    instructions:
      "Up to 3 images per scan. Use OpenAI, Gemini or Claude for PDFs.",
  },
  gemini: {
    label: "Google Gemini",
    name: "Gemini",
    keyURL: "https://aistudio.google.com/api-keys",
    instructions:
      "Create a key in Google AI Studio. Restrict API access to Generative Language API.",
  },
} as const;
export type AIProvider = keyof typeof AI_PROVIDERS;
export const GEMINI_PRIVACY =
  "Do not upload sensitive documents on Gemini’s free tier; uploads may be used for product improvement or human review.";
