import fs from "node:fs/promises";
import path from "node:path";
import { parseM3U, generateM3U } from "./m3u.js";
import type { Playlist, PlaylistTrack } from "./types.js";

export class PlaylistManager {
  private playlists: Map<string, Playlist> = new Map();

  createPlaylist(
    name: string,
    format: Playlist["format"],
    tracks: PlaylistTrack[] = [],
  ): Playlist {
    if (this.playlists.has(name)) {
      throw new Error(`Playlist "${name}" already exists`);
    }

    const now = new Date();
    const playlist: Playlist = {
      name,
      format,
      tracks: [...tracks],
      createdAt: now,
      updatedAt: now,
    };

    this.playlists.set(name, playlist);
    return playlist;
  }

  addTracks(playlistName: string, tracks: PlaylistTrack[]): void {
    const playlist = this.requirePlaylist(playlistName);
    playlist.tracks.push(...tracks);
    playlist.updatedAt = new Date();
  }

  removeTracks(playlistName: string, trackPaths: string[]): void {
    const playlist = this.requirePlaylist(playlistName);
    const pathSet = new Set(trackPaths);
    playlist.tracks = playlist.tracks.filter(
      (track) => !pathSet.has(track.path),
    );
    playlist.updatedAt = new Date();
  }

  getPlaylist(name: string): Playlist {
    return this.requirePlaylist(name);
  }

  listPlaylists(): Playlist[] {
    return [...this.playlists.values()];
  }

  async exportPlaylist(name: string, outputPath: string): Promise<void> {
    const playlist = this.requirePlaylist(name);
    const dir = path.dirname(outputPath);

    const content = generateM3U(playlist.tracks, {
      extended: true,
      relativePaths: true,
      basePath: dir,
    });

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(outputPath, content, "utf-8");
  }

  async importPlaylist(filePath: string): Promise<Playlist> {
    const content = await fs.readFile(filePath, "utf-8");
    const basePath = path.dirname(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const name = path.basename(filePath, ext);
    const format: Playlist["format"] = ext === ".m3u8" ? "m3u8" : "m3u";
    const tracks = parseM3U(content, basePath);

    const now = new Date();
    const playlist: Playlist = {
      name,
      format,
      tracks,
      createdAt: now,
      updatedAt: now,
    };

    this.playlists.set(name, playlist);
    return playlist;
  }

  private requirePlaylist(name: string): Playlist {
    const playlist = this.playlists.get(name);
    if (!playlist) {
      throw new Error(`Playlist "${name}" not found`);
    }
    return playlist;
  }
}
