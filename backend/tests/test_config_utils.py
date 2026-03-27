from backend.app.services.config_utils import as_bool, as_float, as_offload


def test_as_float_accepts_numbers_and_strings() -> None:
    assert as_float(1, 0.0) == 1.0
    assert as_float("2.5", 0.0) == 2.5


def test_as_float_returns_default_for_empty_values() -> None:
    assert as_float("", 1.25) == 1.25
    assert as_float(None, 1.25) == 1.25


def test_as_bool_parses_common_truthy_strings() -> None:
    assert as_bool(True) is True
    assert as_bool("true") is True
    assert as_bool("On") is True
    assert as_bool("0") is False


def test_as_offload_normalizes_supported_values() -> None:
    assert as_offload(" model ") == "model"
    assert as_offload("SEQUENTIAL") == "sequential"
    assert as_offload("invalid") == "none"
