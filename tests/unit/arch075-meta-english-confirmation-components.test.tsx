import assert from "node:assert/strict";
import {test} from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {MetaSubmissionConfirmation} from "../../src/components/admin/whatsapp-templates/meta/meta-submission-confirmation.tsx";
import {fixture} from "../helpers/arch047-template-meta-fixture.ts";

test("existing frozen registrations permit explicit review checkbox but never confirmation without consent",()=>{
 const html=renderToStaticMarkup(<MetaSubmissionConfirmation plan={fixture().plan()} existingRegistrations={20} onConfirmed={async()=>{}} />);
 const checkbox=html.match(/<input[^>]+>/)?.[0];assert.ok(checkbox);assert.doesNotMatch(checkbox,/disabled/);
 assert.match(html,/<button[^>]+disabled=""/);assert.match(html,/Confirm existing registration review/);
 assert.match(html,/without recreating or changing provider work/);
 const unavailable=renderToStaticMarkup(<MetaSubmissionConfirmation plan={null} existingRegistrations={20} onConfirmed={async()=>{}} />);
 assert.match(unavailable,/<input[^>]+disabled=""/);
});
