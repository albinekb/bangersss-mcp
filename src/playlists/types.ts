export interface PlaylistTrack {
  path: string;
  duration?: number;
  title?: string;
  artist?: string;
}

export interface Playlist {
  name: string;
  description?: string;
  format: "m3u" | "m3u8";
  tracks: PlaylistTrack[];
  createdAt: Date;
  updatedAt: Date;
}
