import { useEffect, useRef, useState } from "react";
import api, { getErrorMessage } from "../api";
import type { ListUser, Relation } from "../types";

interface Options {
  /** an action worked: `next` is the person's new relationship, or "removed" if they should disappear from the list */
  onSuccess: (userId: string, next: Relation | "removed") => void;
  /** an action failed: the other side may have changed things, so reload */
  onError: () => void;
}

/**
 * Connect / cancel / accept / reject / block, with a "busy" row and an error message.
 * Used by the chat list and by the "Non-connected users" page, so both behave identically.
 */
export const usePersonActions = ({ onSuccess, onError }: Options) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  // always call the latest callbacks without making the action functions change identity
  const callbacks = useRef({ onSuccess, onError });
  useEffect(() => {
    callbacks.current = { onSuccess, onError };
  });

  const act = async (user: ListUser, request: () => Promise<unknown>, next: Relation | "removed") => {
    setBusyId(user._id);
    setNotice("");
    try {
      await request();
      callbacks.current.onSuccess(user._id, next);
    } catch (err) {
      setNotice(getErrorMessage(err, "Action failed. Please try again."));
      callbacks.current.onError();
    } finally {
      setBusyId(null);
    }
  };

  return {
    busyId,
    notice,
    setNotice,
    actions: {
      onConnect: (u: ListUser) => act(u, () => api.post(`/api/users/request/${u._id}`), "sent"),
      onCancel: (u: ListUser) => act(u, () => api.delete(`/api/users/request/${u._id}`), "none"),
      onAccept: (u: ListUser) => act(u, () => api.post(`/api/users/accept/${u._id}`), "connected"),
      onReject: (u: ListUser) => act(u, () => api.post(`/api/users/reject/${u._id}`), "none"),
      onBlock: (u: ListUser) => act(u, () => api.post(`/api/users/block/${u._id}`), "removed"),
    },
  };
};
