"""Synthetic routing contracts, not evidence of EC/WH52 hardware field names."""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from ecowitt_multitent import ConfigError, load_tent_map, route_packet, sanitize


TENT_A = "11111111-2222-3333-4444-555555555555"
TENT_B = "22222222-3333-4444-5555-666666666666"
TOKEN_A = "vbt_" + "synthetic-a-" * 3
TOKEN_B = "vbt_" + "synthetic-b-" * 3
ENV = {"TOKEN_A": TOKEN_A, "TOKEN_B": TOKEN_B}


def tent(tent_id=TENT_A, token_env="TOKEN_A", **overrides):
    return {"tent_id": tent_id, "label": "Test tent", "token_env": token_env,
            "air_channels": [2, 1], "soil_channels": [1, 2],
            "soil_temp_channels": [1], "co2": True, **overrides}


class MultiTentTests(unittest.TestCase):
    def test_conflicting_passkeys_redact_all_echoes_independent_of_order(self):
        tents, aliases = self.load([tent()])
        raw = {"PASSKEY": "synthetic-first", "passkey": "synthetic-second",
               "temp2f": "77", "runtime": "synthetic-second", "unknown": {"echo": "synthetic-first"}}
        results = [route_packet(payload, tents, aliases) for payload in (raw, dict(reversed(list(raw.items()))))]
        self.assertEqual(*results)
        for packets, unmapped in results:
            text = json.dumps((packets, unmapped))
            self.assertNotIn("synthetic-first", text)
            self.assertNotIn("synthetic-second", text)
            self.assertEqual(packets[0]["metadata"]["device_id"], "ecowitt:unknown:gateway")
            self.assertEqual(packets[0]["metrics"]["temp_f"], 77)

    def test_mapped_tents_cannot_reuse_credential_names_or_values(self):
        second = tent(TENT_B, "TOKEN_B", air_channels=[3], soil_channels=[3],
                      soil_temp_channels=[3], co2=False)
        for token_env, env in (("TOKEN_A", ENV), ("TOKEN_B", {**ENV, "TOKEN_B": TOKEN_A})):
            with self.subTest(token_env=token_env):
                with self.assertRaises(ConfigError) as caught:
                    self.load([tent(), {**second, "token_env": token_env}], env)
                self.assertNotIn(TOKEN_A, str(caught.exception))
                self.assertNotIn(TOKEN_B, str(caught.exception))
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "map.json"

    def load(self, config, env=None):
        self.path.write_text(json.dumps(config), encoding="utf-8")
        return load_tent_map(self.path, ENV if env is None else env)

    def test_prefixed_or_numbered_credential_keys_are_removed_from_unknown_fields(self):
        raw = {key: "synthetic-private-value" for key in (
            "X-API-Key", "apiKey2", "PASSKEY1", "Proxy-Authorization")}
        raw["temperature_channel_note"] = "keep this non-credential field"
        self.assertEqual(sanitize(raw), {
            "temperature_channel_note": "keep this non-credential field"})

    def test_unsupported_leaf_values_become_null_without_stringification(self):
        class PrivateValue:
            def __str__(self):
                raise AssertionError("Untrusted values must not be stringified")

            def __repr__(self):
                raise AssertionError("Untrusted values must not be represented")

        safe = sanitize({"values": [b"private", {"private"}, PrivateValue(), None,
                                     True, 77, 77.0, "77"],
                         "nested": ({"value": PrivateValue(), "PASSKEY": "private"},)})
        self.assertEqual(safe, {"values": [None, None, None, None, True, 77, 77.0, "77"],
                                "nested": [{"value": None}]})
        json.dumps(safe, allow_nan=False)

    def test_unsupported_owned_values_do_not_abort_other_fields_or_tents(self):
        tents, aliases = self.load([tent(air_channels=[1, 3]),
            tent(TENT_B, "TOKEN_B", air_channels=[2], soil_channels=[],
                 soil_temp_channels=[], co2=False)])
        for bad in (b"private", {"private"}, object()):
            with self.subTest(value_type=type(bad).__name__):
                packets, unmapped = route_packet({"temp1f": bad, "humidity1": "50",
                    "temp3f": bad, "temp2f": "80", "humidity2": "60",
                    "unknown": {"nested": bad}}, tents, aliases)
                self.assertTrue(packets[0]["invalid"])
                self.assertNotIn("temp_f", packets[0]["metrics"])
                self.assertEqual(packets[0]["metrics"]["humidity_percent"], 50)
                self.assertIsNone(packets[0]["metadata"]["raw_payload"]["temp1f"])
                self.assertIsNone(packets[0]["metadata"]["channels"][0]["value"])
                self.assertFalse(packets[1]["invalid"])
                self.assertEqual(packets[1]["metrics"]["temp_f"], 80)
                self.assertEqual(unmapped, {"unknown": {"nested": None}})
                json.dumps({"packets": packets, "unmapped": unmapped}, allow_nan=False)

    def test_duplicate_case_values_keep_strict_type_sensitive_conflicts(self):
        tents, aliases = self.load([tent(air_channels=[1])])
        for first, second, conflicting in ((77, 77, False), (77, 77.0, True),
                                            ("77", 77, True), (77, b"77", True)):
            with self.subTest(first_type=type(first).__name__, second_type=type(second).__name__):
                raw = {"TEMP1F": first, "temp1f": second, "humidity1": "50"}
                packets, unmapped = route_packet(raw, tents, aliases)
                repeated, repeated_unmapped = route_packet(dict(reversed(list(raw.items()))), tents, aliases)
                self.assertEqual(packets, repeated)
                self.assertEqual(unmapped, repeated_unmapped)
                self.assertEqual(packets[0]["invalid"], conflicting)
                self.assertEqual("temp_f" in packets[0]["metrics"], not conflicting)

    def test_two_tents_route_without_cross_attribution(self):
        tents, aliases = self.load([tent(air_channels=[1], soil_channels=[1],
                                        soil_temp_channels=[1], co2=True),
                                   tent(TENT_B, "TOKEN_B", air_channels=[2, "in"],
                                        soil_channels=[2], soil_temp_channels=[2], co2=False)])
        packets, unmapped = route_packet({"temp1f": "77", "humidity1": "60",
            "temp2f": "80", "humidity2": "50", "soilmoisture1": "30",
            "soilmoisture2": "40", "tf_ch1": "70", "tf_ch2": "72",
            "co2": "700", "tf_co2": "79", "humi_co2": "55", "winddir": "8"}, tents, aliases)
        self.assertEqual(len(packets), 2)
        self.assertEqual(packets[0]["metrics"]["temp_f"], 77)
        self.assertEqual(packets[1]["metrics"]["temp_f"], 80)
        self.assertNotIn("co2_ppm", packets[1]["metrics"])
        self.assertNotIn("soilmoisture2", packets[0]["metadata"]["raw_payload"])
        self.assertEqual(unmapped, {"winddir": "8"})

    def test_first_listed_channel_is_primary_not_lowest_number(self):
        tents, aliases = self.load([tent()])
        packets, _ = route_packet({"temp1f": "70", "humidity1": "45",
            "temp2f": "80", "humidity2": "50", "soilmoisture1": "30",
            "soilmoisture2": "40"}, tents, aliases)
        packet = packets[0]
        self.assertEqual(packet["metrics"]["temp_f"], 80)
        self.assertEqual(packet["metrics"]["soil_moisture_pct"], 30)
        self.assertEqual(packet["metadata"]["primary_channels"]["temp_f"]["channel"], 2)
        secondary = packet["metadata"]["channels"]
        self.assertTrue(any(c["metric"] == "temp_f" and c["channel"] == 1 for c in secondary))
        self.assertTrue(any(c["metric"] == "soil_moisture_pct" and c["channel"] == 2 for c in secondary))

    def test_missing_primary_never_promotes_secondary(self):
        tents, aliases = self.load([tent()])
        packets, _ = route_packet({"temp1f": "77", "humidity1": "55"}, tents, aliases)
        self.assertNotIn("temp_f", packets[0]["metrics"])
        self.assertNotIn("vpd_kpa", packets[0]["metrics"])
        self.assertEqual(len(packets[0]["metadata"]["channels"]), 2)

    def test_primary_vpd_uses_same_primary_air_pair(self):
        tents, aliases = self.load([tent()])
        packets, _ = route_packet({"temp2f": "77", "humidity2": "50",
                                   "humidity1": "99", "tf_co2": "100", "humi_co2": "5"}, tents, aliases)
        self.assertAlmostEqual(packets[0]["metrics"]["vpd_kpa"], 1.5839, places=3)

    def test_case_insensitive_and_in_channel(self):
        tents, aliases = self.load([tent(air_channels=["in"], co2=False)])
        packets, _ = route_packet({"TEMPINF": "77", "HumidityIn": "50"}, tents, aliases)
        self.assertEqual(packets[0]["metrics"]["temp_f"], 77)
        self.assertEqual(packets[0]["metadata"]["primary_channels"]["temp_f"]["channel"], "in")

    def test_gateway_and_channel_device_ids_contain_only_fingerprint(self):
        tents, aliases = self.load([tent()])
        packets, _ = route_packet({"PASSKEY": "synthetic-private-passkey", "temp2f": "77"}, tents, aliases)
        md = packets[0]["metadata"]
        self.assertRegex(md["device_id"], r"^ecowitt:[0-9a-f]{16}:gateway$")
        self.assertRegex(md["primary_channels"]["temp_f"]["device_id"], r":air_ch2$")
        self.assertNotIn("synthetic-private-passkey", json.dumps(packets))
        self.assertNotIn("PASSKEY", md["raw_payload"])

    def test_no_guessed_ec_or_wh52_aliases(self):
        tents, aliases = self.load([tent()])
        packets, unmapped = route_packet({"ec1": "1.4", "soilad1": "900"}, tents, aliases)
        self.assertEqual(set(unmapped), {"ec1", "soilad1"})
        self.assertNotIn("ec_ms_cm", packets[0]["metrics"])

    def test_explicit_synthetic_alias_and_unit_conversion(self):
        tents, aliases = self.load({"tents": [tent()], "aliases": [
            {"field": "synthetic_ec_input", "metric": "ec_ms_cm", "channel": 1, "unit": "uS/cm"},
            {"field": "synthetic_temperature_input", "metric": "soil_temp_c", "channel": 1, "unit": "C"}]})
        packets, _ = route_packet({"synthetic_ec_input": "1400", "synthetic_temperature_input": "22"}, tents, aliases)
        self.assertEqual(packets[0]["metrics"]["ec_ms_cm"], 1.4)
        self.assertEqual(packets[0]["metrics"]["soil_temp_c"], 22)

    def test_fahrenheit_fields_do_not_accept_celsius_field_as_fahrenheit(self):
        tents, aliases = self.load([tent()])
        packets, unmapped = route_packet({"temp2c": "25", "temp2f": "NaN"}, tents, aliases)
        self.assertNotIn("temp_f", packets[0]["metrics"])
        self.assertIn("temp2c", unmapped)

    def test_all_eight_channels_supported_without_ninth(self):
        tents, aliases = self.load([tent(air_channels=[8], soil_channels=[8], soil_temp_channels=[8])])
        packets, unmapped = route_packet({"temp8f": "77", "humidity8": "50",
            "soilmoisture8": "40", "tf_ch8": "70", "temp9f": "78"}, tents, aliases)
        self.assertEqual(packets[0]["metrics"]["soil_temp_f"], 70)
        self.assertEqual(unmapped, {"temp9f": "78"})

    def test_wh45_auxiliary_air_fields_preserved_only_in_channels(self):
        tents, aliases = self.load([tent(air_channels=[])])
        packets, _ = route_packet({"co2": "700", "tf_co2": "77", "humi_co2": "50"}, tents, aliases)
        self.assertEqual(packets[0]["metrics"], {"co2_ppm": 700})
        self.assertEqual(len(packets[0]["metadata"]["channels"]), 2)

    def test_common_markers_are_preserved_for_each_tent(self):
        tents, aliases = self.load([tent()])
        packets, unmapped = route_packet({"dateutc": "2026-09-28 12:00:00", "model": "GW", "runtime": "10"}, tents, aliases)
        self.assertEqual(unmapped, {})
        self.assertEqual(set(packets[0]["metadata"]["raw_payload"]), {"dateutc", "model", "runtime"})

    def test_duplicate_case_fields_fail_closed(self):
        tents, aliases = self.load([tent()])
        packets, _ = route_packet({"temp2f": "77", "TEMP2F": "100"}, tents, aliases)
        self.assertNotIn("temp_f", packets[0]["metrics"])
        self.assertTrue(packets[0]["invalid"])

    def test_invalid_stuck_and_nonfinite_values_retained_but_not_healthy(self):
        tents, aliases = self.load([tent()])
        for value in ("0", "100", "-1", "101", "NaN", "Infinity", True, None):
            with self.subTest(value=value):
                packets, _ = route_packet({"humidity2": value}, tents, aliases)
                self.assertNotIn("humidity_percent", packets[0]["metrics"])
                self.assertTrue(packets[0]["invalid"])
                self.assertIn("humidity2", packets[0]["metadata"]["raw_payload"])

    def test_order_is_deterministic(self):
        tents, aliases = self.load([tent()])
        raw = {"temp1f": "70", "humidity2": "50", "temp2f": "77", "soilmoisture2": "40"}
        self.assertEqual(route_packet(raw, tents, aliases), route_packet(dict(reversed(list(raw.items()))), tents, aliases))

    def test_conflicts_rejected_for_each_channel_kind_and_co2(self):
        for field, value in (("air_channels", [2]), ("soil_channels", [1]),
                             ("soil_temp_channels", [1]), ("co2", True)):
            with self.subTest(field=field), self.assertRaises(ConfigError):
                other = tent(TENT_B, "TOKEN_B", air_channels=[], soil_channels=[], soil_temp_channels=[], co2=False)
                other[field] = value
                self.load([tent(), other])

    def test_eight_tents_allowed_nine_rejected(self):
        config = [tent(f"{n:08x}-2222-3333-4444-555555555555", f"TOKEN_{n}", air_channels=[],
                       soil_channels=[], soil_temp_channels=[], co2=False) for n in range(1, 10)]
        env = {f"TOKEN_{n}": "vbt_" + f"synthetic_unique_tent_{n}" for n in range(1, 10)}
        self.assertEqual(len(self.load(config[:8], env)[0]), 8)
        with self.assertRaises(ConfigError):
            self.load(config, env)

    def test_bad_uuid_missing_token_and_placeholder_sanitized(self):
        for config, env in (([tent("bad-private-value")], ENV),
                            ([tent("00000000-0000-0000-0000-000000000000")], ENV),
                            ([tent()], {}), ([tent()], {"TOKEN_A": "vbt_REPLACE_WITH_REAL_TOKEN"}),
                            ([tent()], {"TOKEN_A": "Bearer unsafe\nvalue"})):
            with self.subTest(config=config), self.assertRaises(ConfigError) as caught:
                self.load(config, env)
            self.assertNotIn("bad-private-value", str(caught.exception))
            self.assertNotIn("vbt_", str(caught.exception))

    def test_bad_shapes_and_channel_boundaries_rejected(self):
        for config in (None, {}, [], [tent(air_channels=[True])], [tent(air_channels=[0])],
                       [tent(soil_channels=[9])], [tent(soil_channels=["in"])],
                       [tent(soil_temp_channels=[1, 1])], [tent(co2="true")],
                       [tent(TENT_A), tent(TENT_A, "TOKEN_B", air_channels=[], soil_channels=[], soil_temp_channels=[], co2=False)]):
            with self.subTest(config=config), self.assertRaises(ConfigError):
                self.load(config)

    def test_aliases_reject_unknown_unit_metric_duplicates_or_shadowing(self):
        for alias in (
            {"field": "synthetic", "metric": "ec_ms_cm", "channel": 1, "unit": "unknown"},
            {"field": "synthetic", "metric": "temp_f", "channel": 1, "unit": "F"},
            {"field": "PASSKEY", "metric": "ec_ms_cm", "channel": 1, "unit": "mS/cm"},
            {"field": "tf_ch1", "metric": "soil_temp_c", "channel": 1, "unit": "C"}):
            with self.subTest(alias=alias), self.assertRaises(ConfigError):
                self.load({"tents": [tent()], "aliases": [alias]})

    def test_config_parse_error_does_not_echo_file_contents(self):
        self.path.write_text('{"secret": "do-not-print"', encoding="utf-8")
        with self.assertRaises(ConfigError) as caught:
            load_tent_map(self.path, ENV)
        self.assertNotIn("do-not-print", str(caught.exception))

    def test_sanitizer_drops_credentials_and_scrubs_values_and_keys(self):
        raw = {"PASSKEY": "private-passkey", "nested": {"Authorization": TOKEN_A},
               "echo": "prefix " + TOKEN_A, TOKEN_B: "echo", "MAC": "private-mac"}
        safe = sanitize(raw, secrets=(TOKEN_A, TOKEN_B, "private-passkey"))
        dumped = json.dumps(safe)
        for secret in (TOKEN_A, TOKEN_B, "private-passkey", "private-mac"):
            self.assertNotIn(secret, dumped)
        self.assertNotIn("PASSKEY", safe)

    def test_sanitizer_rejects_unsupported_values_without_repr_or_serialization_errors(self):
        class Untrusted:
            def __str__(self):
                raise AssertionError("unsupported values must not be stringified")
        raw = {"bytes": b"synthetic-private", "set": {"synthetic-private"},
               "object": Untrusted(), "nested": [Untrusted(), (None, True, 7, 7.5)]}
        expected = {"bytes": None, "set": None, "object": None,
                    "nested": [None, [None, True, 7, 7.5]]}
        self.assertEqual(sanitize(raw), expected)
        self.assertEqual(json.loads(json.dumps(sanitize(raw), allow_nan=False)), expected)

    def test_unsupported_reading_is_invalid_without_losing_other_metrics(self):
        tents, aliases = self.load([tent(air_channels=[1])])
        packets, _ = route_packet({"temp1f": object(), "humidity1": "50"}, tents, aliases)
        self.assertTrue(packets[0]["invalid"])
        self.assertNotIn("temp_f", packets[0]["metrics"])
        self.assertEqual(packets[0]["metrics"]["humidity_percent"], 50)
        self.assertIsNone(packets[0]["metadata"]["raw_payload"]["temp1f"])

    def test_jwt_redaction_handles_token_boundaries_without_scrubbing_plain_text(self):
        jwt = ".".join(("eyJ" + "synthetic_header", "synthetic_payload", "synthetic_signature"))
        for prefix, suffix in (("(", ")"), ("note=", ";"), ("path/", "/"), ("", "")):
            with self.subTest(prefix=prefix):
                self.assertEqual(sanitize(prefix + jwt + suffix), prefix + "[REDACTED]" + suffix)
        self.assertEqual(sanitize("ordinary non-credential text"), "ordinary non-credential text")

    def test_two_temperature_units_never_create_duplicate_canonical_metric(self):
        tents, aliases = self.load({"tents": [tent()], "aliases": [
            {"field": "synthetic_temperature_input", "metric": "soil_temp_c", "channel": 1, "unit": "C"}]})
        packets, _ = route_packet({"tf_ch1": "70", "synthetic_temperature_input": "22"}, tents, aliases)
        self.assertTrue(packets[0]["invalid"])
        self.assertNotIn("soil_temp_c", packets[0]["metrics"])
        self.assertNotIn("soil_temp_f", packets[0]["metrics"])


if __name__ == "__main__":
    unittest.main()
