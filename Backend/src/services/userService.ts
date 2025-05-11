import User, { IUser } from '../models/User';

export const getUserService = async (id: string): Promise<IUser | null> => {
  return await User.findById(id).select('-password');
};

export const updateUserService = async (id: string, updateData: any): Promise<IUser | null> => {
  return await User.findByIdAndUpdate(id, updateData, { new: true }).select('-password');
};

export const deleteUserService = async (id: string): Promise<IUser | null> => {
  return await User.findByIdAndDelete(id);
};

export const listUsersService = async (): Promise<IUser[]> => {
  return await User.find().select('-password');
};
