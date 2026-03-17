/**
 * TypeScript interfaces mapping to key Rekordbox database tables.
 *
 * Table names in the Rekordbox SQLite DB follow the pattern `djmd*`.
 * Column names are PascalCase.
 */

/** Maps to the `djmdContent` table. */
export interface RbTrack {
  ID: string;
  FolderPath: string | null;
  FileNameL: string | null;
  FileNameS: string | null;
  Title: string | null;
  ArtistID: string | null;
  AlbumID: string | null;
  GenreID: string | null;
  BPM: number | null;
  Rating: number | null;
  ReleaseYear: number | null;
  ReleaseDate: string | null;
  ColorID: number | null;
  /** Musical key as an integer code used by Rekordbox. */
  Key: number | null;
  StockDate: string | null;
  AnalysisDate: string | null;
  Duration: number | null;
  BitRate: number | null;
  BitDepth: number | null;
  SampleRate: number | null;
  Commnt: string | null;
  FileType: number | null;
  TrackNo: number | null;
  /** Full file path reconstructed from FolderPath + FileNameL. */
  FilePath?: string;
}

/** Maps to the `djmdPlaylist` table. */
export interface RbPlaylist {
  ID: string;
  Name: string | null;
  ParentID: string | null;
  Seq: number | null;
  /** Attribute flag: 0 = folder, 1 = playlist. */
  Attribute: number | null;
}

/** Maps to the `djmdSongPlaylist` table. */
export interface RbSongPlaylist {
  ID: string;
  ContentID: string;
  PlaylistID: string;
  TrackNo: number | null;
}

/** Maps to the `djmdCue` table. */
export interface RbCue {
  ID: string;
  ContentID: string;
  InMsec: number | null;
  OutMsec: number | null;
  /** Cue kind: 0 = cue, 1-8 = hot cue slots, etc. */
  Kind: number | null;
  Color: number | null;
  ColorTableIndex: number | null;
  ActiveLoop: number | null;
  Comment: string | null;
  BeatLoopSize: number | null;
  CueLoopType: number | null;
  Hotcue: number | null;
}

/** Maps to the `djmdArtist` table. */
export interface RbArtist {
  ID: string;
  Name: string | null;
  SearchStr: string | null;
}

/** Maps to the `djmdAlbum` table. */
export interface RbAlbum {
  ID: string;
  Name: string | null;
  AlbumArtistID: string | null;
  SearchStr: string | null;
}

/** Maps to the `djmdGenre` table. */
export interface RbGenre {
  ID: string;
  Name: string | null;
}
