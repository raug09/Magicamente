import Schedule from '../models/Schedule';
import User from '../models/User';
import { AppError } from '../utils/AppError';

export interface CreateScheduleInput {
  psychologist: string;
  day: Date;
  hour: string;
  recurrent?: boolean;
}

export const createSchedule = async ({ psychologist, day, hour, recurrent }: CreateScheduleInput) => {
  const psychologistUser = await User.findOne({ _id: psychologist, role: 'psicologo' });
  if (!psychologistUser) {
    throw new AppError(404, 'Psicólogo no encontrado');
  }

  const existingSchedule = await Schedule.findOne({ psychologist, day, hour });
  if (existingSchedule) {
    throw new AppError(409, 'Ya existe un horario con la misma fecha y hora para este psicólogo.');
  }

  const schedule = await Schedule.create({ psychologist, day, hour, recurrent });
  await User.findByIdAndUpdate(psychologist, { $push: { schedules: schedule._id } });

  return schedule;
};

export const getScheduleById = async (psychologist: string) => {
  return Schedule.find({ psychologist });
};

export const updateAvailabilitySchedule = async (scheduleId: string, isAvailable: boolean) => {
  await Schedule.findByIdAndUpdate(scheduleId, { isAvailable });
};
