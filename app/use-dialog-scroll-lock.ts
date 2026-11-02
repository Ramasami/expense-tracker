"use client";
import { useEffect } from "react";

let locks = 0;
let restore: (() => void) | undefined;

export function useDialogScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    locks++;
    if (locks === 1) {
      const body = document.body;
      const html = document.documentElement;
      const { scrollX, scrollY } = window;
      const previous = {
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        width: body.style.width,
        overflow: body.style.overflow,
        paddingRight: body.style.paddingRight,
        htmlOverflow: html.style.overflow,
        scrollBehavior: html.style.scrollBehavior,
      };
      const scrollbar = window.innerWidth - html.clientWidth;
      if (scrollbar > 0)
        body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight) + scrollbar}px`;
      // Fixed positioning also locks the page on mobile browsers where overflow alone leaks scroll.
      body.style.position = "fixed";
      body.style.top = `-${scrollY}px`;
      body.style.left = `-${scrollX}px`;
      body.style.width = "100%";
      body.style.overflow = "hidden";
      html.style.overflow = "hidden";
      restore = () => {
        body.style.position = previous.position;
        body.style.top = previous.top;
        body.style.left = previous.left;
        body.style.width = previous.width;
        body.style.overflow = previous.overflow;
        body.style.paddingRight = previous.paddingRight;
        html.style.overflow = previous.htmlOverflow;
        html.style.scrollBehavior = "auto";
        window.scrollTo(scrollX, scrollY);
        html.style.scrollBehavior = previous.scrollBehavior;
      };
    }
    return () => {
      locks--;
      if (locks === 0) {
        const unlock = restore;
        restore = undefined;
        unlock?.();
      }
    };
  }, [locked]);
}
