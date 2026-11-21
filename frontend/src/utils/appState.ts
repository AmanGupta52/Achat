import { App } from "@capacitor/app";
import { IS_NATIVE } from "../config";

/**
 * "Is the user looking at the app right now?"
 * In a browser that's document.visibilityState; inside the Android app the WebView does not
 * always fire visibility events when the app goes to the background, so Capacitor's own
 * app-state events are used as well.
 */
let nativeActive = true;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((fn) => fn());

if (IS_NATIVE) {
  App.addListener("appStateChange", ({ isActive }) => {
    nativeActive = isActive;
    notify();
  });
}

document.addEventListener("visibilitychange", notify);

export const isPageVisible = (): boolean => !document.hidden && nativeActive;

/** Call `fn` whenever the app moves to / from the background. Returns an unsubscribe function. */
export const subscribeVisibility = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
