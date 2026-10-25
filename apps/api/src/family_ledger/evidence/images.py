import io
import warnings

from PIL import Image, ImageOps, UnidentifiedImageError

from ..auth import AuthError

MAX_BYTES = 6 * 1024 * 1024
MAX_PIXELS = 20_000_000


def inspect_image(data: bytes) -> tuple[str, bytes]:
    if not data or len(data) > MAX_BYTES:
        raise AuthError(413, "EVIDENCE_TOO_LARGE", "이미지는 6MiB 이하로 올려 주세요.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data), formats=["JPEG", "PNG", "WEBP"]) as image:
                media_type = Image.MIME[image.format]
                if (
                    image.width * image.height > MAX_PIXELS
                    or getattr(image, "n_frames", 1) != 1
                ):
                    raise ValueError("Image dimensions or animation rejected")
                image.load()
                oriented = ImageOps.exif_transpose(image).convert("RGB")
                oriented.thumbnail((2400, 2400), Image.Resampling.LANCZOS)
                clean = Image.frombytes("RGB", oriented.size, oriented.tobytes())
                output = io.BytesIO()
                clean.save(output, format="PNG")
                return media_type, output.getvalue()
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ):
        raise AuthError(
            422,
            "INVALID_EVIDENCE",
            "정상적인 JPG, PNG, WebP 정지 이미지를 올려 주세요.",
        ) from None
