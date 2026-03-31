import { useCallback } from "react";
import translations from "./spot-translations.json";

function removeBraced(input: string) {
  let s = input;
  const re = /\{[^{}]*\}/g;
  while (re.test(s)) s = s.replace(re, "");
  return s;
}

type TranslationKey = keyof typeof translations;

export const useTranslations = () => {
  return useCallback(
    (key: string, args?: Record<string, string>): string => {
      const value = translations[key as TranslationKey];
      if (!value) return key;
      return removeBraced(
        value.replace(/{(\w+)}/g, (match, p1) => args?.[p1] || match),
      );
    },
    [],
  );
};
