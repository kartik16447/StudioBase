import { Resend } from 'resend';

export class EmailService {
  private resend: Resend;
  private appUrl: string;

  constructor(apiKey: string, appUrl: string) {
    this.resend = new Resend(apiKey);
    this.appUrl = appUrl.replace(/\/$/, '');
  }

  async sendFirstViewEmail(opts: {
    ownerEmail: string;
    ownerName: string;
    sessionTitle: string;
    shareToken: string;
  }) {
    const { ownerEmail, ownerName, sessionTitle, shareToken } = opts;
    const shareUrl = `${this.appUrl}/s/${shareToken}`;

    await this.resend.emails.send({
      from: 'StudioBase <onboarding@resend.dev>',
      to: ownerEmail,
      subject: `Someone just viewed "${sessionTitle}"`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#111">
          <h2 style="font-size:20px;margin-bottom:8px">Your SOP was just viewed 👀</h2>
          <p style="color:#555;margin-bottom:24px">
            Hi ${ownerName}, someone opened your shared SOP <strong>${sessionTitle}</strong> for the first time.
          </p>
          <a href="${shareUrl}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
            View SOP
          </a>
          <p style="margin-top:32px;font-size:12px;color:#999">
            You're receiving this because you shared a SOP via StudioBase.
            <a href="${this.appUrl}" style="color:#999">Manage notifications</a>
          </p>
        </div>
      `,
    });
  }
}
