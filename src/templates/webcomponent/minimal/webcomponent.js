/**
 * Copyright <%= year %> <%= author %>
 * @license Apache-2.0, see LICENSE for full text.
 */
import { LitElement, html, css } from "lit";

/**
 * `<%= name %>`
 * 
 * @demo index.html
 * @element <%= name %>
 */
export class <%= className %> extends LitElement {

  static get tag() {
    return "<%= name %>";
  }

  constructor() {
    super();
    this.title = "";
  }

  // Lit reactive properties
  static get properties() {
    return {
      title: { type: String },
    };
  }

  // Lit scoped styles
  static get styles() {
    return [
    css`
      :host {
        display: block;
      }
    `];
  }

  // Lit render the HTML
  render() {
    return html`
  <slot></slot>
  `;
  }

}

globalThis.customElements.define(<%= className %>.tag, <%= className %>);