import type {
  RenameFileOp,
  MoveFileOp,
  WriteTagsOp,
  SetBpmOp,
  CreatePlaylistOp,
  AddToPlaylistOp,
  AddToRekordboxPlaylistOp,
  AddToEngineCrateOp,
  DeleteFileOp,
} from './types.js'

export function createRenameOp(from: string, to: string): RenameFileOp {
  return {
    type: 'rename_file',
    status: 'pending',
    from,
    to,
  }
}

export function createMoveOp(from: string, to: string): MoveFileOp {
  return {
    type: 'move_file',
    status: 'pending',
    from,
    to,
  }
}

export function createWriteTagsOp(
  path: string,
  tags: Record<string, unknown>,
): WriteTagsOp {
  return {
    type: 'write_tags',
    status: 'pending',
    path,
    tags,
  }
}

export function createSetBpmOp(path: string, bpm: number): SetBpmOp {
  return {
    type: 'set_bpm',
    status: 'pending',
    path,
    bpm,
  }
}

export function createPlaylistOp(
  name: string,
  tracks: string[],
): CreatePlaylistOp {
  return {
    type: 'create_playlist',
    status: 'pending',
    name,
    tracks,
  }
}

export function createAddToPlaylistOp(
  name: string,
  tracks: string[],
): AddToPlaylistOp {
  return {
    type: 'add_to_playlist',
    status: 'pending',
    name,
    tracks,
  }
}

export function createAddToRekordboxPlaylistOp(
  name: string,
  tracks: string[],
): AddToRekordboxPlaylistOp {
  return {
    type: 'add_to_rekordbox_playlist',
    status: 'pending',
    name,
    tracks,
  }
}

export function createAddToEngineCrateOp(
  name: string,
  tracks: string[],
): AddToEngineCrateOp {
  return {
    type: 'add_to_engine_crate',
    status: 'pending',
    name,
    tracks,
  }
}

export function createDeleteFileOp(path: string): DeleteFileOp {
  return {
    type: 'delete_file',
    status: 'pending',
    path,
  }
}
