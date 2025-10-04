/**
 * Base email layout with shared styles and structure
 */

/**
 * Generate social media footer HTML
 */
function generateSocialFooter() {
  return `
    <table cellspacing="0" cellpadding="0" border="0" role="presentation" width="100%" align="center" style="table-layout: fixed; width: 100%;">
      <tr>
        <td align="center" style="padding-bottom: 0px; padding-top: 0px;">
          <table width="100%" cellspacing="0" cellpadding="0" border="0" role="presentation" height="2" style="border-top-style: solid; border-top-color: #aaaaaa; border-top-width: 2px; font-size: 2px; line-height: 2px;">
            <tr>
              <td height="0" style="font-size: 0px; line-height: 0px;">­</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td align="center">
          <table cellspacing="0" cellpadding="0" border="0" role="presentation" align="center">
            <tr>
              <td valign="top">
                <table cellspacing="0" cellpadding="0" border="0" role="presentation">
                  <tr>
                    <td align="center">
                      <table cellspacing="0" cellpadding="0" border="0" role="presentation" align="center">
                        <tr>
                          <td style="padding: 1px;">
                            <table cellspacing="0" cellpadding="0" border="0" role="presentation" style="margin: 0 auto;">
                              <tr>
                                <th width="42" style="font-weight: normal;">
                                  <table cellspacing="0" cellpadding="0" border="0" role="presentation" style="table-layout: fixed;">
                                    <tr>
                                      <td style="font-size: 0px; line-height: 0px; padding-bottom: 5px; padding-top: 5px;">
                                        <a href="https://www.alocubanoboulderfest.org/" target="_blank" style="color: #666; text-decoration: underline;">
                                          <img src="https://creative-assets.mailinblue.com/editor/social-icons/squared_light/website_32px.png" width="32" height="32" border="0" style="display: block; width: 32px; height: 32px;">
                                        </a>
                                      </td>
                                      <td width="5" style="font-size: 0px; line-height: 1px;">­</td>
                                    </tr>
                                  </table>
                                </th>
                                <th width="42" style="font-weight: normal;">
                                  <table cellspacing="0" cellpadding="0" border="0" role="presentation" style="table-layout: fixed;">
                                    <tr>
                                      <td style="font-size: 0px; line-height: 0px; padding-bottom: 5px; padding-top: 5px;">
                                        <a href="https://www.instagram.com/alocubano.boulderfest/" target="_blank" style="color: #666; text-decoration: underline;">
                                          <img src="https://creative-assets.mailinblue.com/editor/social-icons/squared_light/instagram_32px.png" width="32" height="32" border="0" style="display: block; width: 32px; height: 32px;">
                                        </a>
                                      </td>
                                      <td width="5" style="font-size: 0px; line-height: 1px;">­</td>
                                    </tr>
                                  </table>
                                </th>
                                <th width="32" style="font-weight: normal;">
                                  <table cellspacing="0" cellpadding="0" border="0" role="presentation" style="table-layout: fixed;">
                                    <tr>
                                      <td style="font-size: 0px; line-height: 0px; padding-bottom: 5px; padding-top: 5px;">
                                        <a href="https://chat.whatsapp.com/KadIVdb24RWKdIKGtipnLH" target="_blank" style="color: #666; text-decoration: underline;">
                                          <img src="https://creative-assets.mailinblue.com/editor/social-icons/squared_light/whatsapp_32px.png" width="32" height="32" border="0" style="display: block; width: 32px; height: 32px;">
                                        </a>
                                      </td>
                                    </tr>
                                  </table>
                                </th>
                              </tr>
                            </table>
                          </td>
                        </tr>
                        <tr>
                          <td align="center" style="padding-top: 3px; padding-bottom: 5px;">
                            <p style="margin: 0; font-size: 14px; color: #666;">
                              <a href="mailto:alocubanoboulderfest@gmail.com" style="color: #3f4799; text-decoration: underline;">alocubanoboulderfest@gmail.com</a>
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Wrap content in base email layout
 * @param {string} content - HTML content to wrap
 * @param {string} title - Email title
 * @returns {string} Complete HTML email
 */
export function wrapInBaseLayout(content, title = 'A Lo Cubano Boulder Fest') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="format-detection" content="telephone=no">
    <title>${title}</title>
    <style type="text/css" emogrify="no">
        #outlook a { padding:0; }
        .ExternalClass { width:100%; }
        .ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div { line-height: 100%; }
        table td { border-collapse: collapse; mso-line-height-rule: exactly; }
        .editable.image { font-size: 0 !important; line-height: 0 !important; }
        .nl2go_preheader { display: none !important; mso-hide:all !important; mso-line-height-rule: exactly; visibility: hidden !important; line-height: 0px !important; font-size: 0px !important; }
        body { width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; margin:0; padding:0; }
        img { outline:none; text-decoration:none; -ms-interpolation-mode: bicubic; }
        a img { border:none; }
        table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
        th { font-weight: normal; text-align: left; }
        *[class="gmail-fix"] { display: none !important; }
    </style>
    <style type="text/css" emogrify="no">
        @media (max-width: 600px) {
            .gmx-killpill { content: ' \\03D1';}
            .r0-o { border-style: solid !important; margin: 0 auto 0 auto !important; width: 320px !important }
            .r1-i { background-color: #ffffff !important }
            .r2-c { box-sizing: border-box !important; text-align: center !important; valign: top !important; width: 100% !important }
            .r3-o { border-style: solid !important; margin: 0 auto 0 auto !important; width: 100% !important }
            .r4-i { background-color: #ffffff !important; padding-bottom: 20px !important; padding-left: 15px !important; padding-right: 15px !important; padding-top: 20px !important }
            .r5-c { box-sizing: border-box !important; display: block !important; valign: top !important; width: 100% !important }
            .r6-o { border-style: solid !important; width: 100% !important }
            .r7-i { padding-left: 0px !important; padding-right: 0px !important }
            .r8-i { padding-bottom: 20px !important; padding-left: 15px !important; padding-right: 15px !important; padding-top: 20px !important }
            .r9-c { box-sizing: border-box !important; padding-bottom: 15px !important; padding-top: 15px !important; width: 100% !important }
            body { -webkit-text-size-adjust: none }
            .nl2go-responsive-hide { display: none }
            .nl2go-body-table { min-width: unset !important }
            .mobshow { height: auto !important; overflow: visible !important; max-height: unset !important; visibility: visible !important }
            .resp-table { display: inline-table !important }
            .magic-resp { display: table-cell !important }
        }
    </style>
    <style type="text/css">
        p, h1, h2, h3, h4, ol, ul, li { margin: 0; }
        .nl2go-default-textstyle { color: #3b3f44; font-family: Arial, sans-serif; font-size: 16px; line-height: 1.5; word-break: break-word }
        .default-button { color: #ffffff; font-family: Arial, Helvetica, sans-serif; font-size: 16px; font-style: normal; font-weight: normal; line-height: 1.15; text-decoration: none; word-break: break-word }
        a, a:link { color: #3f4799; text-decoration: underline }
        .default-heading1 { color: #1F2D3D; font-family: Arial, sans-serif; font-size: 36px; font-weight: 700; word-break: break-word }
        .default-heading2 { color: #1F2D3D; font-family: Arial, sans-serif; font-size: 24px; font-weight: 700; word-break: break-word }
        .default-heading3 { color: #1F2D3D; font-family: Arial, sans-serif; font-size: 18px; font-weight: 700; word-break: break-word }
        a[x-apple-data-detectors] { color: inherit !important; text-decoration: inherit !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
        .no-show-for-you { border: none; display: none; float: none; font-size: 0; height: 0; line-height: 0; max-height: 0; mso-hide: all; overflow: hidden; table-layout: fixed; visibility: hidden; width: 0; }
    </style>
</head>
<body style="background-color: #ffffff; margin: 0; padding: 0;">
    <table cellspacing="0" cellpadding="0" border="0" role="presentation" width="100%" style="background-color: #ffffff;">
        <tr>
            <td>
                <table cellspacing="0" cellpadding="0" border="0" role="presentation" width="600" align="center" class="r0-o" style="table-layout: fixed; width: 600px;">
                    <tr>
                        <td valign="top" class="r1-i" style="background-color: #ffffff;">

                            <!-- Logo -->
                            <table cellspacing="0" cellpadding="0" border="0" role="presentation" width="100%" align="center" class="r3-o" style="table-layout: fixed; width: 100%;">
                                <tr>
                                    <td class="r4-i" style="background-color: #ffffff; padding-bottom: 20px; padding-top: 20px;">
                                        <table width="100%" cellspacing="0" cellpadding="0" border="0" role="presentation">
                                            <tr>
                                                <th width="100%" valign="top" class="r5-c" style="font-weight: normal;">
                                                    <table cellspacing="0" cellpadding="0" border="0" role="presentation" width="100%" class="r6-o" style="table-layout: fixed; width: 100%;">
                                                        <tr>
                                                            <td valign="top" class="r7-i" style="padding-left: 15px; padding-right: 15px;">
                                                                <table width="100%" cellspacing="0" cellpadding="0" border="0" role="presentation">
                                                                    <tr>
                                                                        <td align="center" class="r2-c">
                                                                            <table cellspacing="0" cellpadding="0" border="0" role="presentation" width="106" class="r3-o" style="table-layout: fixed; width: 106px;">
                                                                                <tr>
                                                                                    <td style="font-size: 0px; line-height: 0px;">
                                                                                        <img src="https://img.mailinblue.com/9670291/images/content_library/original/68a6c02f3da913a8d57a0190.png" width="106" border="0" style="display: block;">
                                                                                    </td>
                                                                                </tr>
                                                                            </table>
                                                                        </td>
                                                                    </tr>
                                                                </table>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </th>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <!-- Main Content -->
                            <table cellspacing="0" cellpadding="0" border="0" role="presentation" width="100%" align="center" class="r3-o" style="table-layout: fixed; width: 100%;">
                                <tr>
                                    <td class="r8-i" style="padding-bottom: 20px; padding-top: 20px;">
                                        <table width="100%" cellspacing="0" cellpadding="0" border="0" role="presentation">
                                            <tr>
                                                <th width="100%" valign="top" class="r5-c" style="font-weight: normal;">
                                                    <table cellspacing="0" cellpadding="0" border="0" role="presentation" width="100%" class="r6-o" style="table-layout: fixed; width: 100%;">
                                                        <tr>
                                                            <td valign="top" class="r7-i" style="padding-left: 15px; padding-right: 15px;">
                                                                <table width="100%" cellspacing="0" cellpadding="0" border="0" role="presentation">
                                                                    <tr>
                                                                        <td class="r9-c nl2go-default-textstyle" style="color: #3b3f44; font-family: Arial, sans-serif; font-size: 16px; line-height: 1.5; word-break: break-word; padding-bottom: 15px; padding-top: 15px;">
                                                                            ${content}
                                                                        </td>
                                                                    </tr>
                                                                </table>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </th>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <!-- Social Media Footer -->
                            ${generateSocialFooter()}

                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

export { generateSocialFooter };
