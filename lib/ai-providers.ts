// Add providers here only alongside an authenticated, allowlisted server adapter.
export const AI_PROVIDERS = {
  openai: {
    label: "OpenAI (ChatGPT)",
    name: "OpenAI",
    keyURL: "https://platform.openai.com/api-keys",
    instructions:
      "Create a Restricted project API key with Responses → Write permission. Read-only cannot analyze documents. Other endpoints can stay disabled; no Files permission is required. Ensure the project has API billing and access to the configured model.",
  },
  claude: {
    label: "Anthropic Claude",
    name: "Claude",
    keyURL: "https://platform.claude.com/settings/keys",
    instructions:
      "Create a Claude API key in your Anthropic workspace with access to the configured model and API billing. Read-only credentials cannot generate responses. Claude subscriptions are separate from API usage. Images and PDFs are supported; review Anthropic’s API data terms before uploading financial documents.",
  },
  groq: {
    label: "Groq",
    name: "Groq",
    keyURL: "https://console.groq.com/keys",
    instructions:
      "Create a GroqCloud API key for your project. Allow access to the configured vision model. Groq scans accept up to 3 images; use screenshots of PDF pages, or choose OpenAI/Gemini for PDFs. The current vision model is a preview and availability may change. Free-tier quotas vary. Review Groq Data Controls before uploading financial documents.",
  },
  gemini: {
    label: "Google Gemini",
    name: "Gemini",
    keyURL: "https://aistudio.google.com/api-keys",
    instructions:
      "Create an API key in Google AI Studio. In Google Cloud, restrict its API access to the Generative Language API. Browser HTTP-referrer restrictions will not work: requests come from Apps Script. Free-tier availability and quotas depend on your project; a Google AI subscription is separate from API billing.",
  },
} as const;
export type AIProvider = keyof typeof AI_PROVIDERS;
export const GEMINI_PRIVACY =
  "Gemini free-tier documents may be used to improve Google products and reviewed by humans. Do not upload sensitive or personal statements under unpaid terms; use redacted documents or an eligible paid project. Free quotas vary.";
