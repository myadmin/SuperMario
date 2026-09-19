/**
 * loaders/music.ts — ported verbatim from upstream `public/js/loaders/music.js`.
 */
import { loadJSON } from './loaders'
import MusicPlayer from '../MusicPlayer'

type MusicSheet = Record<string, { url: string }>

export function loadMusicSheet(name: string): Promise<MusicPlayer> {
  return loadJSON<MusicSheet>(`/music/${name}.json`).then((musicSheet) => {
    const musicPlayer = new MusicPlayer()
    for (const [trackName, track] of Object.entries(musicSheet)) {
      musicPlayer.addTrack(trackName, track.url)
    }
    return musicPlayer
  })
}
