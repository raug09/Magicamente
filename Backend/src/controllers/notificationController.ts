import { Request, Response } from 'express';
import { sendEmail } from '../services/notificationService';

export const sendTestEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await sendEmail({
      from: 'Magicamente <marketing@magicamente.online>',
      to: 'jostinjoseramirez@gmail.com',
      subject: 'No Reply',
      html: '<strong>Revisa el wp!</strong>',
    });
    res.status(200).json({ data });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};
