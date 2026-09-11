"""OLF-specific error codes and exception type."""


class OlfError(Exception):
    """Raised by the OLF parser/writer on any spec-defined error condition."""

    def __init__(self, code: str, message: str, details: dict[str, object] | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details: dict[str, object] = details or {}
