import { LitElement, html, css } from "lit";
import { DDDSuper } from "@haxtheweb/d-d-d/d-d-d.js";

export class <%= className %> extends DDDSuper(LitElement) {

  static get tag() {
    return "<%= name %>";
  }

  constructor() {
    super();
    this.title = "";
  }

  static get properties() {
    return {
      title: { type: String },
    };
  }

  static get styles() {
    return [super.styles,
    css`
      :host {
        display: block;
      }
      p {
        font-size: var(--<%= name %>-font-size);
      }
    `];
  }
  

  render() {
    return html`
      <div class="wrapper">
        <p>${this.title}</p>
        <slot></slot>
      </div>`;
  }

  /**
   * haxProperties integration via file reference
   */
  static get haxProperties() {
    return new URL(`./lib/${this.tag}.haxProperties.json`, import.meta.url)
      .href;
  }
}

globalThis.customElements.define(<%= className %>.tag, <%= className %>);
