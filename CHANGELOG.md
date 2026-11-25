# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [26.11.0](https://github.com/haxtheweb/create/compare/v26.8.1...v26.11.0) (2026-11-25)


### Features

* add quartoToSite to hax --import-structure (haxtheweb/issues[#2189](https://github.com/haxtheweb/create/issues/2189)) ([e0fe785](https://github.com/haxtheweb/create/commit/e0fe7856739df73fb6d0b3c70f20987de11e88e9))
* **audit ssr:** createElement builds registered classes; alias self ([effedf3](https://github.com/haxtheweb/create/commit/effedf38a2f4acc2ef7a1247649febf6a3fbe471))
* **audit ssr:** inert DOM environment and progressive-enhancement fallbacks ([dc6f564](https://github.com/haxtheweb/create/commit/dc6f564f1feb21daecbbf4241de142c8258c6fff)), closes [haxtheweb/issues#3161](https://github.com/haxtheweb/issues/issues/3161)
* **audit:** add report-only `hax audit ssr` ([66806d2](https://github.com/haxtheweb/create/commit/66806d24ca05b43b5712f37b80e4ae605f3553e6)), closes [haxtheweb/issues#3161](https://github.com/haxtheweb/issues/issues/3161)
* **site:** --agent flag and commit attribution for in-process route calls ([4720c4c](https://github.com/haxtheweb/create/commit/4720c4c4401cd80d2bb84d37f55d9371b781ed88)), closes [haxtheweb/issues#3191](https://github.com/haxtheweb/issues/issues/3191) [haxtheweb/haxcms-nodejs#151](https://github.com/haxtheweb/haxcms-nodejs/issues/151)
* **site:** add openstaxToSite to --import-structure ([6b23863](https://github.com/haxtheweb/create/commit/6b23863be8af73f786b5b9eee81e52f728a7ab8f)), closes [haxtheweb/issues#2912](https://github.com/haxtheweb/issues/issues/2912) [haxtheweb/haxcms-nodejs#40](https://github.com/haxtheweb/haxcms-nodejs/issues/40)
* **site:** add vitepressToSite to --import-structure ([dfdbb07](https://github.com/haxtheweb/create/commit/dfdbb07303009a90f5bf2258a78892ea7e1998a5)), closes [haxtheweb/issues#2923](https://github.com/haxtheweb/issues/issues/2923) [haxtheweb/haxcms-nodejs#42](https://github.com/haxtheweb/haxcms-nodejs/issues/42)
* **site:** site:login-link mints a one-time sign-in link ([#2854](https://github.com/haxtheweb/create/issues/2854)) ([3f2d38f](https://github.com/haxtheweb/create/commit/3f2d38ff860ea68a9e7e5016be89d2b12a1f4dc8)), closes [haxtheweb/haxcms-nodejs#67](https://github.com/haxtheweb/haxcms-nodejs/issues/67)
* **skills:** add hax-rpg-character skill for extending the avatar ([8d91d78](https://github.com/haxtheweb/create/commit/8d91d7897c577445988e782e2bb61e6ae070b354))
* **webcomponent:** English-only locales in monorepos with the locale guard ([3c3de60](https://github.com/haxtheweb/create/commit/3c3de602b46d7f35eb20bdd43b02f554f1a9c5e2)), closes [haxtheweb/issues#3262](https://github.com/haxtheweb/issues/issues/3262)


### Bug Fixes

* **audit-ssr:** cap collected HTML at 8 MB and mark the row truncated ([e1e6de4](https://github.com/haxtheweb/create/commit/e1e6de4ac08a83185852b9327b1140655ef60bc8))
* **audit-ssr:** keep the text of multi-line error messages ([0e22cac](https://github.com/haxtheweb/create/commit/0e22cac7b0024548f63acf1f3f9ec89e7a770c0a))
* **audit-ssr:** strip HTML blocks to a fixed point (CodeQL) ([7609a55](https://github.com/haxtheweb/create/commit/7609a555367dadb862d68b4b77b403e4bf065a87))
* **cli:** accept installed hidden themes and register Twig constant() for site ops ([eb4da8e](https://github.com/haxtheweb/create/commit/eb4da8e00f165f58fe1fe7d21d580ac5d08cf000)), closes [haxtheweb/issues#3318](https://github.com/haxtheweb/issues/issues/3318) [haxtheweb/issues#3319](https://github.com/haxtheweb/issues/issues/3319)

## [26.8.1](https://github.com/haxtheweb/create/compare/v26.0.4...v26.8.1) (2026-08-14)

## [26.0.0](https://github.com/haxtheweb/create/compare/v26.0.4...v26.0.0) (2026-08-14)

## [26.0.4](https://github.com/haxtheweb/create/compare/v26.0.3...v26.0.4) (2026-05-21)

## [26.0.3](https://github.com/haxtheweb/create/compare/v26.0.2...v26.0.3) (2026-05-14)

## [26.0.2](https://github.com/haxtheweb/create/compare/v26.0.1...v26.0.2) (2026-05-12)

## [26.0.1](https://github.com/haxtheweb/create/compare/v26.0.0...v26.0.1) (2026-05-12)

## [26.0.0](https://github.com/haxtheweb/create/compare/v25.0.2...v26.0.0) (2026-05-12)

## [25.0.2](https://github.com/haxtheweb/create/compare/v25.0.1...v25.0.2) (2026-02-16)

## [25.0.1](https://github.com/haxtheweb/create/compare/v25.0.0...v25.0.1) (2026-02-16)

## [25.0.0](https://github.com/haxtheweb/create/compare/v11.0.7...v25.0.0) (2026-01-09)

## [11.0.7](https://github.com/haxtheweb/create/compare/v11.0.6...v11.0.7) (2025-07-24)

## [11.0.6](https://github.com/haxtheweb/create/compare/v11.0.5...v11.0.6) (2025-07-24)

## [11.0.5](https://github.com/haxtheweb/create/compare/v11.0.4...v11.0.5) (2025-06-18)

## [11.0.4](https://github.com/haxtheweb/create/compare/v11.0.3...v11.0.4) (2025-06-12)

## [11.0.3](https://github.com/haxtheweb/create/compare/v11.0.2...v11.0.3) (2025-06-06)

## [11.0.2](https://github.com/haxtheweb/create/compare/v11.0.1...v11.0.2) (2025-06-06)

## [11.0.1](https://github.com/haxtheweb/create/compare/v10.0.8...v11.0.1) (2025-06-06)

## [11.0.0](https://github.com/haxtheweb/create/compare/v10.0.8...v11.0.0) (2025-06-06)

## [11.0.0](https://github.com/haxtheweb/create/compare/v10.0.8...v11.0.0) (2025-06-06)

## [10.0.8](https://github.com/haxtheweb/create/compare/v10.0.7...v10.0.8) (2025-04-07)

## [10.0.7](https://github.com/haxtheweb/create/compare/v10.0.6...v10.0.7) (2025-04-03)

## [10.0.6](https://github.com/haxtheweb/create/compare/v10.0.5...v10.0.6) (2025-04-03)

## [10.0.5](https://github.com/haxtheweb/create/compare/v10.0.4...v10.0.5) (2025-03-07)

## [10.0.4](https://github.com/haxtheweb/create/compare/v10.0.3...v10.0.4) (2025-02-24)

## [10.0.3](https://github.com/haxtheweb/create/compare/v10.0.2...v10.0.3) (2025-02-24)

## [10.0.2](https://github.com/haxtheweb/create/compare/v10.0.1...v10.0.2) (2025-01-23)

## [10.0.1](https://github.com/haxtheweb/create/compare/v9.0.25...v10.0.1) (2024-12-23)

## [9.0.25](https://github.com/haxtheweb/create/compare/v9.0.24...v9.0.25) (2024-12-12)

## [9.0.24](https://github.com/haxtheweb/create/compare/v9.0.23...v9.0.24) (2024-12-12)

## [9.0.23](https://github.com/haxtheweb/create/compare/v9.0.22...v9.0.23) (2024-12-12)

## [9.0.22](https://github.com/haxtheweb/create/compare/v9.0.21...v9.0.22) (2024-12-10)

## [9.0.21](https://github.com/haxtheweb/create/compare/v9.0.20...v9.0.21) (2024-12-09)

## [9.0.20](https://github.com/haxtheweb/create/compare/v9.0.19...v9.0.20) (2024-12-05)

## [9.0.19](https://github.com/haxtheweb/create/compare/v9.0.18...v9.0.19) (2024-12-03)

## [9.0.18](https://github.com/haxtheweb/create/compare/v9.0.17...v9.0.18) (2024-11-26)

## [9.0.17](https://github.com/haxtheweb/create/compare/v9.0.16...v9.0.17) (2024-11-26)

## [9.0.16](https://github.com/haxtheweb/create/compare/v9.0.15...v9.0.16) (2024-11-26)

## [9.0.15](https://github.com/haxtheweb/create/compare/v9.0.14...v9.0.15) (2024-11-20)

## [9.0.14](https://github.com/haxtheweb/create/compare/v9.0.13...v9.0.14) (2024-11-19)

## [9.0.13](https://github.com/haxtheweb/create/compare/v9.0.12...v9.0.13) (2024-11-18)

## [9.0.12](https://github.com/haxtheweb/create/compare/v9.0.11...v9.0.12) (2024-11-15)

## [9.0.11](https://github.com/haxtheweb/create/compare/v9.0.10...v9.0.11) (2024-10-31)

## [9.0.10](https://github.com/haxtheweb/create/compare/v9.0.9...v9.0.10) (2024-10-29)

## [9.0.9](https://github.com/haxtheweb/create/compare/v9.0.8...v9.0.9) (2024-10-29)

## [9.0.8](https://github.com/haxtheweb/create/compare/v9.0.7...v9.0.8) (2024-10-21)

## [9.0.7](https://github.com/haxtheweb/create/compare/v9.0.6...v9.0.7) (2024-10-11)

## [9.0.6](https://github.com/haxtheweb/create/compare/v9.0.5...v9.0.6) (2024-08-22)

## [9.0.5](https://github.com/haxtheweb/create/compare/v9.0.3...v9.0.5) (2024-08-03)

## [9.0.3](https://github.com/haxtheweb/create/compare/v9.0.2...v9.0.3) (2024-07-30)

## [9.0.2](https://github.com/haxtheweb/create/compare/v9.0.1...v9.0.2) (2024-07-24)

## [9.0.1](https://github.com/haxtheweb/create/compare/v9.0.0...v9.0.1) (2024-07-22)

## [9.0.0](https://github.com/haxtheweb/create/compare/v0.1.5...v9.0.0) (2024-07-12)

## [0.1.5](https://github.com/haxtheweb/create/compare/v0.1.4...v0.1.5) (2024-06-24)

## [0.1.4](https://github.com/haxtheweb/create/compare/v0.1.3...v0.1.4) (2024-06-21)

## [0.1.3](https://github.com/haxtheweb/create/compare/v0.1.2...v0.1.3) (2024-06-21)

## [0.1.2](https://github.com/haxtheweb/create/compare/v0.1.1...v0.1.2) (2024-05-31)

## 0.1.1 (2024-05-31)
