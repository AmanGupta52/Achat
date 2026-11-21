import { LocalNotifications } from "@capacitor/local-notifications";
import { IS_NATIVE } from "../config";
import { isPageVisible } from "./appState";

/**
 * New-message notifications.
 *  - browser:     the Web Notification API
 *  - Android app: Capacitor Local Notifications (the WebView has no Notification API)
 *
 * They appear while the app is running (in front or recently sent to the background).
 * Messages that arrive while the app is fully closed need push (FCM) — see the README.
 */
export type NotifPermission = "granted" | "denied" | "default" | "unsupported";

const CHANNEL_ID = "messages";

let clickHandler: ((userId: string) => void) | null = null;

if (IS_NATIVE) {
  // Android 8+ needs a channel; create it once at startup
  LocalNotifications.createChannel({
    id: CHANNEL_ID,
    name: "Messages",
    description: "New chat messages",
    importance: 4,
    visibility: 1,
    vibration: true,
  }).catch(() => {});

  // tapping a notification → open that conversation
  LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
    const userId = (event.notification.extra as { userId?: string } | undefined)?.userId;
    if (userId) clickHandler?.(userId);
  });
}

const fromNative = (display: string): NotifPermission =>
  display === "granted" ? "granted" : display === "denied" ? "denied" : "default";

export const checkNotificationPermission = async (): Promise<NotifPermission> => {
  if (IS_NATIVE) return fromNative((await LocalNotifications.checkPermissions()).display);
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
};

export const requestNotificationPermission = async (): Promise<NotifPermission> => {
  if (IS_NATIVE) return fromNative((await LocalNotifications.requestPermissions()).display);
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.requestPermission();
};

/** Register (or clear, with null) what happens when the user taps a notification. */
export const setNotificationClickHandler = (handler: ((userId: string) => void) | null): void => {
  clickHandler = handler;
};

/** Only interrupt the user when they're not already looking at the app. */
const shouldNotify = (): boolean => !isPageVisible() || (!IS_NATIVE && !document.hasFocus());

/** Android notification ids are 32-bit ints; same person → same id → newer message replaces the old one. */
const idFor = (userId: string): number => {
  let h = 0;
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h) % 2147483647 || 1;
};

interface MessageNotification {
  userId: string;
  title: string;
  body: string;
  iconUrl?: string;
}

/** Fire-and-forget: does nothing if the app is in front or notifications aren't allowed. */
export const showMessageNotification = ({ userId, title, body, iconUrl }: MessageNotification): void => {
  if (!shouldNotify()) return;

  (async () => {
    if ((await checkNotificationPermission()) !== "granted") return;

    if (IS_NATIVE) {
      await LocalNotifications.schedule({
        notifications: [{ id: idFor(userId), title, body, channelId: CHANNEL_ID, extra: { userId } }],
      });
      return;
    }

    const n = new Notification(title, { body, tag: userId, icon: iconUrl });
    n.onclick = () => {
      window.focus();
      clickHandler?.(userId);
      n.close();
    };
  })().catch(() => {});
};
