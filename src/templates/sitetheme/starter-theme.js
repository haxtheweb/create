/**
 * Copyright <%= year %> <%= author %>
 * @license Apache-2.0, see License.md for full text.
 */
import {
  HAXCMSLitElementTheme,
  css,
  unsafeCSS,
  html,
} from "@haxtheweb/haxcms-elements/lib/core/HAXCMSLitElementTheme.js";
import { HAXCMSThemeParts } from "@haxtheweb/haxcms-elements/lib/core/utils/HAXCMSThemeParts.js";
import { HAXCMSMobileMenuMixin } from "@haxtheweb/haxcms-elements/lib/core/utils/HAXCMSMobileMenu.js";
import { DDDSuper } from "@haxtheweb/d-d-d/d-d-d.js";
import "@haxtheweb/haxcms-elements/lib/ui-components/site/site-title.js";
import "@haxtheweb/haxcms-elements/lib/ui-components/navigation/site-menu.js";
import "@haxtheweb/haxcms-elements/lib/ui-components/navigation/site-menu-button.js";
import "@haxtheweb/haxcms-elements/lib/ui-components/navigation/site-breadcrumb.js";
import "@haxtheweb/haxcms-elements/lib/ui-components/active-item/site-active-title.js";
import "@haxtheweb/haxcms-elements/lib/ui-components/layout/site-region.js";

// Media queries can't read CSS custom properties, so breakpoints are numbers.
// These match the DDD md breakpoint (900px); below it the side menu collapses.
// (Newer DDD builds export DDDBreakpoints from d-d-d/lib/DDDLayout.js, but a
// site's build may predate it, so the theme doesn't import it.)
const bpMd = unsafeCSS(900);
const bpBelowMd = unsafeCSS(899);

/**
 * @title <%= className %>
 * `<%= className %>`: a HAXcms theme started from the `starter` template.
 *
 * HOW TO EDIT THIS FILE (people and AI agents alike)
 * - Blocks marked `@hax-theme-contract <id>` are what HAXcms needs for
 *   editing, accessibility and the theme picker to work. Restyle them and
 *   move them around, but keep them. `hax audit theme` checks every one
 *   and reports by the same <id>.
 * - Blocks marked `@hax-theme-optional <name>` are safe to delete if the
 *   design doesn't call for them.
 * - Style with DDD tokens (--ddd-spacing-*, --ddd-font-*, --ddd-radius-*,
 *   --ddd-theme-default-*) and pair light/dark values with light-dark().
 * - Check your work: `hax audit theme` (contract), `hax audit` (DDD tokens).
 *
 * @documentation - see HAX docs to learn more about theming
 *  - Custom theme development - https://haxtheweb.org/documentation/developers/haxsite/custom-theme-development
 *  - Theme Blocks - https://haxtheweb.org/documentation/developers/theme-blocks
 *  - DDD - https://haxtheweb.org/documentation/ddd
 *  - Data Store - https://haxtheweb.org/documentation/developers/haxsite/data-store
 *
 * @hax-theme-contract element-jsdoc: the element name below must match
 * static get tag()
 * @element <%= customThemeName %>
 */
// @hax-theme-contract base-class: HAXCMSLitElementTheme is the innermost
// class; mixins wrap it, they never replace it.
class <%= className %> extends HAXCMSThemeParts(
  HAXCMSMobileMenuMixin(DDDSuper(HAXCMSLitElementTheme)),
) {
  // @hax-theme-contract tag: tooling reads the tag name from here
  static get tag() {
    return "<%= customThemeName %>";
  }

  constructor() {
    super();
    // UI text goes through this.t so it can be translated
    this.t = {
      ...this.t,
      skipToContent: "Skip to content",
    };
  }

  // @hax-theme-optional palettes: DDD palette numbers this theme supports.
  // HAXcms sets data-palette on the theme, which swaps the
  // --ddd-palette-color-N values used below. Return [] to hide the picker.
  static get supportedPalettes() {
    return ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"];
  }

  // @hax-theme-contract global-styles-super: styles for document-level
  // things (body, :root). Always spread the parent's styles first.
  HAXCMSGlobalStyleSheetContent() {
    return [
      ...super.HAXCMSGlobalStyleSheetContent(),
      css`
        body {
          margin: var(--ddd-spacing-0);
          padding: var(--ddd-spacing-0);
        }
      `,
    ];
  }

  static get styles() {
    return [
      // @hax-theme-contract super-styles: carries skip-link, #slot and
      // edit-mode styles from the base class and mixins
      super.styles,
      css`
        :host {
          /* Design knobs: change these first. Theme-local custom properties
             keep a --ddd- prefix (like clean-one) so the hax audit DDD check reads them
             as DDD tokens. */
          --ddd-theme-menu-width: 280px;
          --ddd-theme-content-max-width: 840px;
          /* @hax-theme-contract dark-mode: light-dark() pairs follow
             color-scheme, which follows the site's dark mode toggle */
          --ddd-lightDark-background: light-dark(
            var(--ddd-theme-default-white),
            var(--ddd-theme-default-coalyGray)
          );
          --ddd-lightDark-text: light-dark(
            var(--ddd-theme-default-coalyGray),
            var(--ddd-theme-default-white)
          );
          --ddd-lightDark-surface: light-dark(
            var(--ddd-theme-default-limestoneMaxLight),
            var(--ddd-theme-default-potentialMidnight)
          );
          --ddd-palette-accent-background: var(--ddd-palette-color-1, var(--ddd-theme-default-beaverBlue));
          --ddd-palette-accent-text: var(--ddd-palette-text-color-1, var(--ddd-theme-default-white));

          display: block;
          min-height: 100vh;
          color-scheme: light;
          background-color: var(--ddd-lightDark-background);
          color: var(--ddd-lightDark-text);
          font-family: var(--ddd-font-primary);
        }
        :host([dark-mode]) {
          color-scheme: dark;
        }
        /* Make room for the HAX editor tray while editing */
        :host([edit-mode]) {
          margin: var(
            --hax-tray-element-align-margin,
            0 0 0 calc(var(--hax-tray-width) - var(--hax-tray-menubar-min-width))
          );
          transition: margin var(--ddd-duration-slow, 0.6s) ease-in-out;
        }
        :host([edit-mode][tray-status="collapsed"]) {
          margin: var(--ddd-spacing-0);
        }
        a:focus-visible,
        button:focus-visible {
          outline: var(--ddd-border-size-sm) solid currentColor;
          outline-offset: var(--ddd-spacing-1);
        }

        header {
          display: flex;
          align-items: center;
          gap: var(--ddd-spacing-3);
          padding: var(--ddd-spacing-3) var(--ddd-spacing-6);
          background-color: var(--ddd-palette-accent-background);
          color: var(--ddd-palette-accent-text);
        }
        site-title {
          color: var(--ddd-palette-accent-text);
          --site-title-heading-font-size: var(--ddd-font-size-s);
          --site-title-heading-font-weight: var(--ddd-font-weight-bold);
          --site-title-heading-margin: var(--ddd-spacing-0);
        }

        .layout {
          display: flex;
          align-items: stretch;
        }
        .menu-column {
          flex: 0 0 var(--ddd-theme-menu-width);
          background-color: var(--ddd-lightDark-surface);
          /* site-menu / map-menu ship their own colors; point them at the
             theme's tokens so the active item stays readable in both modes */
          --site-menu-container-background-color: var(--ddd-lightDark-surface);
          --site-menu-active-color: var(--ddd-palette-accent-background);
          --site-menu-item-active-item-color: var(--ddd-palette-accent-text);
          --map-menu-item-a-color: var(--ddd-lightDark-text);
          --map-menu-item-a-active-color: var(--ddd-palette-accent-text);
          --map-menu-item-a-active-background-color: var(--ddd-palette-accent-background);
          --map-menu-item-icon-active-color: var(--ddd-palette-accent-text);
        }
        main {
          flex: 1 1 auto;
          min-width: 0;
        }
        #contentcontainer {
          max-width: var(--ddd-theme-content-max-width);
          margin: var(--ddd-spacing-0) auto;
          padding: var(--ddd-spacing-6);
        }
        site-breadcrumb {
          margin-bottom: var(--ddd-spacing-2);
        }
        .pager {
          display: flex;
          justify-content: space-between;
          max-width: var(--ddd-theme-content-max-width);
          margin: var(--ddd-spacing-0) auto;
          padding: var(--ddd-spacing-0) var(--ddd-spacing-6) var(--ddd-spacing-6);
        }
        footer {
          padding: var(--ddd-spacing-6);
          background-color: var(--ddd-lightDark-surface);
          border-top: var(--ddd-border-sm);
        }
        /* site-region renders nothing until a page is assigned to it in
           Appearance > Regions, so empty wrappers stay out of the way */
        .region:not(:has(*)) {
          display: none;
        }
        #haxcmsmobilemenubutton {
          display: none;
        }

        @media (min-width: ${bpMd}px) {
          .menu-column {
            border-right: var(--ddd-border-sm);
          }
        }
        /* @hax-theme-contract responsive: every layout needs a narrow
           viewport fallback, even a fixed-width design */
        @media (max-width: ${bpBelowMd}px) {
          :host([edit-mode]) {
            margin: var(--ddd-spacing-0);
          }
          #haxcmsmobilemenubutton {
            display: inline-flex;
          }
          .layout {
            flex-direction: column;
          }
          .menu-column {
            flex-basis: auto;
            border-bottom: var(--ddd-border-sm);
          }
          :host(:not([menu-open])) .menu-column {
            display: none;
          }
          #contentcontainer {
            padding: var(--ddd-spacing-4);
          }
        }
      `,
    ];
  }

  render() {
    return html`
      <!-- @hax-theme-contract skip-link: first focusable element on the page -->
      <a class="skip-link" href="#contentcontainer">${this.t.skipToContent}</a>
      <header part="header">
        ${this.HAXCMSMobileMenuButton()}
        <site-title></site-title>
        <!-- @hax-theme-optional regions: names must be ones Appearance > Regions
             can assign: header, sidebarFirst, sidebarSecond, contentTop,
             contentBottom, footerPrimary, footerSecondary -->
        <site-region class="region" name="header"></site-region>
      </header>
      <div class="layout">
        <aside class="menu-column" part="site-menu">
          ${this.HAXCMSMobileMenu()}
          <site-region class="region" name="sidebarFirst"></site-region>
        </aside>
        <main>
          <!-- @hax-theme-contract content-container: HAX attaches the editor to
               #contentcontainer > #slot > slot. Keep the ids and nesting. -->
          <article id="contentcontainer" tabindex="-1">
            <!-- @hax-theme-optional breadcrumb -->
            <site-breadcrumb part="page-breadcrumb"></site-breadcrumb>
            <site-active-title part="page-title"></site-active-title>
            <site-region class="region" name="contentTop"></site-region>
            <div id="slot"><slot></slot></div>
            <site-region class="region" name="contentBottom"></site-region>
          </article>
          <!-- @hax-theme-optional pager -->
          <nav class="pager" part="pager">
            <site-menu-button type="prev" position="top"></site-menu-button>
            <site-menu-button type="next" position="top"></site-menu-button>
          </nav>
        </main>
      </div>
      <footer part="footer">
        <site-region class="region" name="footerPrimary"></site-region>
        <site-region class="region" name="footerSecondary"></site-region>
      </footer>
    `;
  }
}
// @hax-theme-contract define: register the element under its tag
globalThis.customElements.define(<%= className %>.tag, <%= className %>);
export { <%= className %> };
