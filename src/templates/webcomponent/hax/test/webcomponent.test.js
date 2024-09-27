import { fixture, expect, html } from "@open-wc/testing";
import "../<%= name %>.js";

describe("<%= className %> test", () => {
  let element;
  beforeEach(async () => {
    element = await fixture(html`
      <<%= name %>
        title="title"
      ></<%= name %>>
    `);
  });

  it("basic will it blend", async () => {
    expect(element).to.exist;
  });

  it("passes the a11y audit", async () => {
    await expect(element).shadowDom.to.be.accessible();
  });
});
