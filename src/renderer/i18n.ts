import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zh from './locales/zh.json'
import zhTW from './locales/zh-TW.json'
import yue from './locales/yue.json'
import en from './locales/en.json'
import lzh from './locales/lzh.json'
import miao from './locales/miao.json'
import ikun from './locales/ikun.json'
import yd from './locales/yd.json'

// 自动匹配系统语言的辅助函数
export function getSystemLanguage(): 'zh' | 'zh-TW' | 'yue' | 'en' | 'lzh' | 'miao' | 'ikun' | 'yd' {
  const sysLang = (navigator.language || 'zh').toLowerCase()
  if (sysLang === 'zh-lzh' || sysLang === 'lzh') {
    return 'lzh'
  }
  if (sysLang.includes('zh-hk') || sysLang.includes('zh-mo') || sysLang.includes('yue')) {
    return 'zh-TW' 
  }
  if (sysLang.includes('zh-tw') || sysLang.includes('zh-tc')) {
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
      yue: { translation: yue },
      en: { translation: en },
      lzh: { translation: lzh },
      miao: { translation: miao },
      ikun: { translation: ikun },
      yd: { translation: yd }
    },
    lng: getSystemLanguage(), // 首次启动时自动匹配系统语言
    fallbackLng: 'zh',
    interpolation: {
      escapeValue: false
    }
  })

export default i18n
