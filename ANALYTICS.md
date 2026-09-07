# Google Analytics 4 setup

The site sends a focused set of GA4 events from `js/analytics.js`. Standard
`page_view` events continue to come from the Google tag in each HTML page.

## Events

| Event | When it fires | Useful parameters |
| --- | --- | --- |
| `section_view` | A visitor reaches a page section for the first time | `section_name`, `time_to_view_msec` |
| `section_engagement` | A visitor leaves a section or the page | `section_name`, `section_time_msec` |
| `scroll_depth` | The visitor reaches 25%, 50%, 75%, or 90% | `percent_scrolled` |
| `select_content` | A project link is selected | `content_id`, `link_kind`, `destination_domain` |
| `project_view` | A project detail page opens | `project_id`, `time_to_view_msec` |
| `contact_click` | Email or a social profile is selected | `method`, `section_name` |
| `outbound_click` | A non-project external link is selected | `link_domain`, `link_path` |
| `first_interaction` | The visitor first acts on the page | `input_method`, `time_to_interaction_msec` |
| `engagement_milestone` | Active time reaches 10, 30, 60, or 120 seconds | `milestone_seconds`, `active_section` |
| `session_summary` | The visitor leaves the page | `active_time_msec`, `elapsed_time_msec`, `interaction_count`, `sections_viewed`, `max_scroll_percent` |
| `web_vitals_summary` | The visitor leaves the page | `fcp_msec`, `lcp_msec`, `cls_score`, `inp_msec` |

Active time counts only while the page is visible and the visitor has interacted
within the last 30 seconds. Every custom event also includes GA4's
`engagement_time_msec`, containing active time since the preceding event.

## GA4 configuration

In **Admin → Data display → Custom definitions**, create event-scoped custom
dimensions for the text parameters you want in reports, such as `section_name`,
`content_id`, `link_kind`, `method`, and `page_type`.

Create event-scoped custom metrics for numeric parameters you want to aggregate,
especially `section_time_msec`, `active_time_msec`, `elapsed_time_msec`,
`time_to_action_msec`, and `percent_scrolled`. Use milliseconds for the time
metrics and Standard for percentages and counts.

Enhanced measurement can remain enabled. Its automatic outbound event is named
`click`; this site's more intentional event is named `outbound_click`, so the two
are easy to distinguish.

## Testing

Localhost traffic is ignored by default. Open a local page with `?ga_debug=1`
to send test events to GA4 DebugView. In the browser console,
`window.__portfolioAnalyticsDebug` contains the events generated during that
debug session.
