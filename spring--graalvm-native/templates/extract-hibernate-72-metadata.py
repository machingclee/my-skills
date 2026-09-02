#!/usr/bin/env python3
"""Dump Hibernate 7.2 native-image reflection entries from hibernate-core.jar.

Usage:
  python3 extract-hibernate-72-metadata.py /path/to/hibernate-core-7.2.x.Final.jar

Prints a reachability-metadata.json fragment (reflection + resources) to stdout.
Merge those arrays into src/main/resources/META-INF/native-image/reachability-metadata.json.
Do not replace Flyway / H2 / app entries.
"""
from __future__ import annotations

import json
import sys
import zipfile


def class_names(zf: zipfile.ZipFile, prefix: str, suffix: str, allow_inner: bool) -> list[str]:
    out = []
    for name in zf.namelist():
        if not name.startswith(prefix) or not name.endswith(suffix):
            continue
        if not allow_inner and "$" in name:
            continue
        out.append(name[: -len(".class")].replace("/", "."))
    return sorted(out)


def main() -> None:
    if len(sys.argv) != 2:
        print(__doc__.strip(), file=sys.stderr)
        sys.exit(2)
    jar = sys.argv[1]
    with zipfile.ZipFile(jar) as zf:
        loggers = class_names(zf, "", "_$logger.class", allow_inner=True)
        loggers = [n for n in loggers if n.startswith("org.hibernate.")]
        wrappers = class_names(
            zf,
            "org/hibernate/boot/models/annotations/internal/",
            ".class",
            allow_inner=False,
        )
        listeners = class_names(
            zf,
            "org/hibernate/event/spi/",
            "Listener.class",
            allow_inner=False,
        )

    reflection = []
    for name in loggers:
        reflection.append(
            {
                "type": name,
                "allDeclaredConstructors": True,
                "allPublicConstructors": True,
                "allPublicMethods": True,
            }
        )
    for name in wrappers:
        reflection.append(
            {
                "type": name,
                "allDeclaredConstructors": True,
                "allPublicConstructors": True,
                "allPublicMethods": True,
            }
        )
    for name in listeners:
        reflection.append({"type": f"{name}[]"})

    doc = {
        "comment": (
            f"Hibernate 7.2 native gaps extracted from {jar}. "
            f"{len(loggers)} *_$logger, {len(wrappers)} annotation wrappers, "
            f"{len(listeners)} event-listener arrays. Merge; do not replace Flyway/H2."
        ),
        "reflection": reflection,
        "resources": [{"glob": "org/hibernate/**/*.i18n.properties"}],
    }
    json.dump(doc, sys.stdout, indent=2)
    sys.stdout.write("\n")
    print(
        f"# loggers={len(loggers)} wrappers={len(wrappers)} listener_arrays={len(listeners)}",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
