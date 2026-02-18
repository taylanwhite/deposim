import { createContext, useContext } from 'react';
import en from './en.json';
import es from './es.json';

const dictionaries = { en, es };

const LanguageContext = createContext({ lang: 'en', t: (key) => key, prefix: '' });

export function LanguageProvider({ lang = 'en', children }) {
  const strings = dictionaries[lang] || en;
  const prefix = lang === 'en' ? '' : `/${lang}`;

  const t = (key, vars) => {
    let s = strings[key] || en[key] || key;
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        s = s.replaceAll(`{${k}}`, v);
      });
    }
    return s;
  };

  return (
    <LanguageContext.Provider value={{ lang, t, prefix }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useT() {
  return useContext(LanguageContext);
}

export function useLangPrefix() {
  const { prefix } = useContext(LanguageContext);
  return prefix;
}

export default LanguageContext;
