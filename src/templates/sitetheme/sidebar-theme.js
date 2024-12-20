/**
 * Copyright <%= year %> <%= author %>
 * @license Apache-2.0, see License.md for full text.
 */
import { html, css } from "lit";
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
    return html`
        <p>
          <a href="https://raise.psu.edu/">Give</a>
          <a href="https://www.psu.edu/admission">Apply</a>
          <a href="https://universityethics.psu.edu/reporting-at-penn-state">Report A Concern</a>
        </p>`
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
    return html`
      <p>
        The Pennsylvania State University <br>
        201 Old Main <br>
        University Park, PA 16802 <br><br>
        Phone: 1-814-865-4700
      </p>`
  }

  renderFooterSecondarySlot() {
    return html`
        <ul>
          <li>Explore</li>
          <ul>
              <li><a href="https://www.psu.edu/news/">News</a></li>
              <li><a href="https://hr.psu.edu/careers">Careers</a></li>
              <li><a href="https://www.psu.edu/academics/colleges">Colleges</a></li>
              <li><a href="https://www.psu.edu/academics/campuses">Campuses</a></li>
              <li><a href="https://www.psu.edu/contact-us">Contact Us</a></li>
          </ul>
        </ul>
        <ul>          
          <li>Student Support</li>
          <ul>
              <li><a href="http://www.registrar.psu.edu/">Registrar</a></li>
              <li><a href="http://www.bursar.psu.edu/">Bursar</a></li>
              <li><a href="https://studentaffairs.psu.edu/">Student Affairs</a></li>
              <li><a href="https://liveon.psu.edu/">Housing and Food Services</a></li>
          </ul>
        </ul>
        <ul>
          <li>Quick Links</li> 
          <ul>
              <li><a href="https://www.psu.edu/maps">Maps</a></li>
              <li><a href="https://www.psu.edu/search/directories/">Directory</a></li>
              <li><a href="https://libraries.psu.edu/">Libraries</a></li>
              <li><a href="https://www.registrar.psu.edu/academic-calendars/">Academic Calendar</a></li> 
              <li><a href="https://lionpathsupport.psu.edu/">LionPATH</a></li>
              <li><a href="https://www.pennstatehealth.org/">Penn State Health</a></li>
          </ul>   
        </ul>
        <ul>
          <li>Resources</li>
          <ul>
              <li><a href="https://www.psu.edu/prospective-students">Prospective Students</a></li>
              <li><a href="https://www.psu.edu/current-students">Current Students</a></li>
              <li><a href="https://global.psu.edu/">International Students</a></li>
              <li><a href="https://www.psu.edu/business-and-industry">Business and Industry</a></li>
              <li><a href="https://veterans.psu.edu/">Veterans and Military</a></li>
              <li><a href="https://www.psu.edu/visitors">Visitors</a></li>
              <li><a href="https://www.psu.edu/faculty-and-staff">Faculty and Staff</a></li>
              <li><a href="https://www.alumni.psu.edu/">Alumni</a></li>
              <li><a href="https://media.psu.edu/">Media</a></li>
          </ul>
        </ul>
        <ul>
          <li>Stay Connected</li>
          <ul>
              <li><a href="https://headlines.psu.edu/">Email/Headlines</a> </li>
              <li><a href="https://psualert.psu.edu/">Emergency Notifications</a></li>
              <li><a href="https://mobile.psu.edu/">Penn State Go</a></li>
              <li><a href="https://strategiccommunications.psu.edu/">Strategic Communications</a> </li>
              <li><a href="https://universityethics.psu.edu/reporting-at-penn-state">Report Misconduct</a></li>
              <li><a href="https://www.police.psu.edu/">Police</a></li>
          </ul>
        </ul>
        `
  }

  renderFooterPrimarySlot() {
    return html`
      <p>
        <a href="https://www.psu.edu/web-privacy-statement">Privacy Statements</a>
        <a href="https://policy.psu.edu/policies/ad85">Non Discrimination</a>
        <a href="https://www.psu.edu/accessibilitystatement">Accessibility</a>
        <a href="https://policy.psu.edu/policies/hr11">Equal Opportunity</a>
        <a href="https://www.psu.edu/legal-statements">Legal Statements</a>
      </p>
      <p>
        <a href="https://www.psu.edu/copyright-information">The Pennsylvania State University © 2024</a>
      </p>`
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
