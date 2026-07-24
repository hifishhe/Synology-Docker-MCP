# Changelog

## 1.0.2 — 2026-07-24

### Added

- Native DSM Container Manager Project tools:
  - `synology_dsm_project_list`
  - `synology_dsm_project_log`
  - `synology_dsm_project_manage`
- `synology_dsm_container_list` for inspecting DSM's displayed container name-to-ID mapping.

### Safety

- `synology_dsm_project_manage` permits only `build_stream`, `start_stream`, `stop_stream`, and `restart_stream`.
- Destructive DSM Project actions `clean` and `delete` are intentionally not exposed.
- `synology_project_manage` is documented as a legacy `docker-compose` wrapper for non-DSM-managed projects only. DSM Container Manager Projects must use the DSM-native tools.

### Compatibility

- The MCP server's reported version is aligned with the package version (`1.0.2`).
