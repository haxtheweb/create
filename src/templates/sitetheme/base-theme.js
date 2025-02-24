/**
 * Copyright <%= year %> <%= author %>
 * @license Apache-2.0, see License.md for full text.
 */
import { html, css, HAXCMSLitElementTheme } from "@haxtheweb/haxcms-elements/lib/core/HAXCMSLitElementTheme.js";

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
 * @element <%= customThemeName %>
 */
class <%= className %> extends HAXCMSLitElementTheme {
  //styles function
  static get styles() {
    return [
      super.styles,
      css`
        :host {
          display: block;
        }
      `,
    ];
  }

  /**
   * Store the tag name to make it easier to obtain directly.
   * @notice function name must be here for tooling to operate correctly
   */
  static get tag() {
    return "<%= customThemeName %>";
  }
 
  constructor() {
    super();
  }
}
customElements.define(<%= className %>.tag, <%= className %>);
export { <%= className %> };
