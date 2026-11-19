import { createContext } from "react";

/** A copy of the page the reader was on, where it sat on screen, and its address. */
export interface LeavingPage {
  clone: HTMLElement;
  rect: DOMRect;
  /** The book opens back onto this page: from the cover, or once signed in. */
  path: string;
}

/**
 * Set for the render in which the app's pages give way to the cover (signing out, or opening
 * the sign-in page from the app): the sidebar fades out, the page the reader left pulls back
 * into a leaf of the book, and the cover closes over it.
 */
export const BookClosingContext = createContext<{ closing: boolean; page: LeavingPage | null }>({
  closing: false,
  page: null,
});

/** The open book pulls back from the reader and tilts like a book on a table. */
export const BOOK_PULL_BACK_MS = 1700;
/** The cover swings shut once the book has mostly settled. */
export const BOOK_CLOSE_DELAY_MS = 1150;
export const BOOK_CLOSE_MS = 900;
export const SIDEBAR_FADE_MS = 700;
