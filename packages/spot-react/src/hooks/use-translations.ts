import { useSpotContext } from "../spot-context";
import { Translations } from "../types";
import defaultTranslations from "../i18n/en.json";
import { useCallback } from "react";

function removeBraced(input: string) {
  let s = input;
  const re = /\{[^{}]*\}/g;
  while (re.test(s)) s = s.replace(re, "");
  return s;
}

export const useTranslations = () => {
  const context = useSpotContext();

  const t = useCallback(
    (key: keyof Translations, args?: Record<string, string>): string => {
      const dynamicTranslation = context.getTranslation?.(key, args);

      if (dynamicTranslation && dynamicTranslation !== key) {
        return dynamicTranslation;
      }

      const staticTranslation = context.translations?.[key] || (defaultTranslations as Translations)[key];
      return removeBraced(staticTranslation.replace(/{(\w+)}/g, (match: string, p1: string) => args?.[p1] || match));
    },
    [context.getTranslation, context.translations],
  );

  return t;
};
