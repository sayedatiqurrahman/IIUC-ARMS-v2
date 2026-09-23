'use client';

import { createContext, useContext, useState } from 'react';

export type Locale = 'en' | 'ar';

interface LocaleCtx {
  lang: Locale;
  setLang: (l: Locale) => void;
}

const Ctx = createContext<LocaleCtx>({ lang: 'en', setLang: () => {} });

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Locale>('en');
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

export function useLocale(): LocaleCtx {
  return useContext(Ctx);
}