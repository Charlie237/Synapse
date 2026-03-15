"""Album endpoints."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class CreateAlbumRequest(BaseModel):
    name: str


class RenameAlbumRequest(BaseModel):
    name: str


class AlbumImagesRequest(BaseModel):
    image_ids: list[int]


@router.post("/albums")
async def create_album(req: CreateAlbumRequest):
    from db.queries import create_album

    album_id = create_album(req.name)
    return {"id": album_id}


@router.get("/albums")
async def list_albums():
    from db.queries import get_albums

    albums = get_albums()
    return {"albums": albums}


@router.get("/albums/{album_id}")
async def get_album(album_id: int):
    from db.queries import get_album_by_id, get_album_images

    album = get_album_by_id(album_id)
    if not album:
        raise HTTPException(404, "Album not found")
    images = get_album_images(album_id)
    return {**album, "images": images}


@router.put("/albums/{album_id}")
async def rename_album(album_id: int, req: RenameAlbumRequest):
    from db.queries import get_album_by_id, rename_album

    album = get_album_by_id(album_id)
    if not album:
        raise HTTPException(404, "Album not found")
    rename_album(album_id, req.name)
    return {"ok": True}


@router.delete("/albums/{album_id}")
async def delete_album(album_id: int):
    from db.queries import get_album_by_id, delete_album

    album = get_album_by_id(album_id)
    if not album:
        raise HTTPException(404, "Album not found")
    delete_album(album_id)
    return {"ok": True}


@router.post("/albums/{album_id}/images")
async def add_album_images(album_id: int, req: AlbumImagesRequest):
    from db.queries import get_album_by_id, add_images_to_album

    album = get_album_by_id(album_id)
    if not album:
        raise HTTPException(404, "Album not found")
    add_images_to_album(album_id, req.image_ids)
    return {"ok": True}


@router.delete("/albums/{album_id}/images")
async def remove_album_images(album_id: int, req: AlbumImagesRequest):
    from db.queries import get_album_by_id, remove_images_from_album

    album = get_album_by_id(album_id)
    if not album:
        raise HTTPException(404, "Album not found")
    remove_images_from_album(album_id, req.image_ids)
    return {"ok": True}
