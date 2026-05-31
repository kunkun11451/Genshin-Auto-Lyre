/**
 * core/index.ts - 核心模块统一导出
 *
 * 汇总导出所有核心模块的类型、常量、函数和类，
 * 外部只需 import { ... } from '@/core' 即可使用。
 */

// 常量
export {
  GAME_NOTES,
  NOTE_TO_KEY,
  KEY_TO_NOTE,
  NOTE_NAMES,
  BLACK_KEY_SEMITONES,
  FLOOR_MAP,
  CEIL_MAP,
  NEAREST_MAP,
  OCTAVE_RANGES,
} from './constants';

// MIDI 解析器
export { parseMidiBuffer } from './midi-parser';
export type { ParsedNote, ParsedMidi } from './midi-parser';

// 音符映射器
export { mapNotes, DEFAULT_MAPPER_OPTIONS, DEFAULT_BLACK_KEY_CONFIG } from './note-mapper';
export type {
  BlackKeyStrategy,
  BlackKeyConfig,
  MapperOptions,
  MappedNote,
} from './note-mapper';

// 播放引擎
export { PlaybackEngine } from './playback-engine';
export type { PlaybackState, PlaybackCallbacks } from './playback-engine';
