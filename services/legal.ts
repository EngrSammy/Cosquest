// The legal and help pages and where they live (configured per build,
// services/appConfig.ts). Shown by app/legal/[doc].tsx.
import { appConfig } from "./appConfig";

export const LEGAL_DOCS = {
  terms: { title: "Terms of Service", url: appConfig.termsUrl },
  privacy: { title: "Privacy Policy", url: appConfig.privacyUrl },
  guidelines: { title: "Community Guidelines", url: appConfig.guidelinesUrl },
  faq: { title: "FAQ", url: appConfig.faqUrl },
} as const;

export type LegalDoc = keyof typeof LEGAL_DOCS;

/** The in-app route for a page. */
export function legalRoute(doc: LegalDoc) {
  return `/legal/${doc}` as const;
}
