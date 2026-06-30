"""PDL-specific error types."""


class PdlParseError(Exception):
    """Raised when a PDL document cannot be parsed (syntax / structure)."""


class PdlValidationError(Exception):
    """Raised when a PDL document is structurally valid but semantically inconsistent."""
