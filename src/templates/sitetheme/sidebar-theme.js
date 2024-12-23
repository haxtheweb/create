/**
 * Copyright <%= year %> <%= author %>
 * @license Apache-2.0, see License.md for full text.
 */
import { html, css, HAXCMSLitElementTheme } from "@haxtheweb/haxcms-elements/lib/core/HAXCMSLitElementTheme.js";
import { PolarisFlexTheme } from "@haxtheweb/polaris-theme/lib/polaris-flex-theme";
import "@haxtheweb/haxcms-elements/lib/ui-components/blocks/site-children-block.js";

/**
 * `<%= className %>`
 * `<%= className %> based on modern flex design system`
 * `This theme is an example of extending an existing theme component`
 *
 * @microcopy - language worth noting:
 *  - HAXcms - A headless content management system
 *  - HAXCMSTheme - A super class that provides correct baseline wiring to build a new theme
 *
 * @demo demo/index.html
 * @element <%= customName %>
 */
class <%= className %> extends PolarisFlexTheme {
  //styles function
  static get styles() {
    return [
      super.styles,
      css`
        :host {
          display: block;
        }
        aside {
          float: left;
          width: 240px;
        }
        aside section h4 {
          font-size: 16px;
          margin: 0 0 24px 0;
          text-transform: uppercase;
          font-family: "Open Sans", sans-serif;
          font-weight: 300;
        }

        aside section {
          background-color: #fff;
          border-radius: 3px;
          margin-bottom: 40px;
          padding: 0px 40px 40px 0px;
        }

        site-children-block {
          --site-children-block-border-bottom: lightblue 1px solid;
          --site-children-block-li-padding: 8px 0;
          --site-children-block-link-hover-color: rgb(0, 95, 169);
          --site-children-block-active-border-left: rgb(0, 95, 169) 3px solid;
          --site-children-block-link-active-color: rgb(0, 30, 68);
          font-family: "Roboto Condensed", sans-serif;
          font-size: 16px;
        }
      `,
    ];
  }

  /**
   * Overload methods for customization of slots from the base class 
   */
  renderHeaderSlot() {
    return html``
  }

  renderSideBar() {
    return html`
    <aside
          role="complementary"
          aria-label="Primary Sidebar"
          itemtype="http://schema.org/WPSideBar"
          part="page-primary-sidebar"
        >
          <section>
            <site-children-block
              part="page-children-block"
              dynamic-methodology="ancestor"
            ></site-children-block>
          </section>
        </aside>
    `
  }

  renderFooterContactInformation() {
    return html``
  }

  renderFooterSecondarySlot() {
    return html``
  }

  renderFooterPrimarySlot() {
    return html``
  }

  /**
   * Store the tag name to make it easier to obtain directly.
   * @notice function name must be here for tooling to operate correctly
   */
  static get tag() {
    return "<%= customName %>";
  }
 
  constructor() {
    super();
  }
}
customElements.define(<%= className %>.tag, <%= className %>);
export { <%= className %> };
