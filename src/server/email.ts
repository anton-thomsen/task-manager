import { Resend } from "resend";

import { env } from "~/env";

type EmailMessage = {
	to: string;
	subject: string;
	text: string;
};

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export async function sendEmail(message: EmailMessage): Promise<void> {
	if (!resend) {
		if (env.NODE_ENV === "production") {
			throw new Error("RESEND_API_KEY is required to send email.");
		}
		console.info(
			`[email:dev] to=${message.to} subject=${message.subject}\n${message.text}`,
		);
		return;
	}
	const { error } = await resend.emails.send({
		from: env.EMAIL_FROM,
		to: message.to,
		subject: message.subject,
		text: message.text,
	});
	if (error) throw new Error(`The email could not be sent: ${error.message}`);
}
