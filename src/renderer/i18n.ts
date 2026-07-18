import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zh from './locales/zh.json'
import zhTW from './locales/zh-TW.json'
import en from './locales/en.json'

// 自动匹配系统语言的辅助函数
export function getSystemLanguage(): 'zh' | 'zh-TW' | 'en' {
  const sysLang = (navigator.language || 'zh').toLowerCase()
  if (sysLang.includes('zh-hk') || sysLang.includes('zh-mo') || sysLang.includes('zh-tw') || sysLang.includes('zh-tc')) {
    return 'zh-TW'
  }
  if (sysLang.includes('zh')) {
    return 'zh'
  }
  return 'en'
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      zh: { translation: zh },
      'zh-TW': { translation: zhTW },
      en: { translation: en }
    },
    lng: getSystemLanguage(), // 首次启动时自动匹配系统语言
    fallbackLng: 'zh',
    interpolation: {
      escapeValue: false
    }
  })

export default i18n
