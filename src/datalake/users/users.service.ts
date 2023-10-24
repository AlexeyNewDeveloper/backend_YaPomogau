import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { HashService } from '../../hash/hash.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './schemas/user.schema';
import { PointGeoJSON } from '../../common/schemas/PointGeoJSON.schema';
import { UserRole } from '../../common/types/user.types';
import exceptions from '../../common/constants/exceptions';

type ChangeFields<T, R> = Omit<T, keyof R> & R;
type CreateUserDtoWithoutPassword = ChangeFields<
  CreateUserDto,
  {
    administrative: Omit<CreateUserDto['administrative'], 'password'>;
  }
>;

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private UserModel: Model<User>,
    private hashService: HashService
  ) {}

  async create(createUserDto: CreateUserDto): Promise<CreateUserDtoWithoutPassword> {
    const hashedPassword = this.hashService.generateHash(createUserDto.administrative.password);
    const createdUser = new this.UserModel({
      ...createUserDto,
      administrative: { ...createUserDto.administrative, password: hashedPassword },
    });
    const savedUser = await createdUser.save();
    const savedUserObject = savedUser.toObject();
    delete savedUserObject.administrative.password;

    return savedUserObject;
  }

  async findAll(): Promise<User[]> {
    return this.UserModel.find().lean().exec();
  }

  async findOne(id: mongoose.Types.ObjectId): Promise<User> {
    return this.UserModel.findById(id).orFail(new Error(exceptions.users.notFound)).lean().exec();
  }

  async update(id: mongoose.Types.ObjectId, updateUserDto: UpdateUserDto) {
    return this.UserModel.findByIdAndUpdate(id, updateUserDto)
      .orFail(new Error(exceptions.users.notFound))
      .lean()
      .exec();
  }

  async remove(id: mongoose.Types.ObjectId) {
    return this.UserModel.findByIdAndRemove(id)
      .orFail(new Error(exceptions.users.notFound))
      .lean()
      .exec();
  }

  async findVolunteerWithin(center: PointGeoJSON, distance: number): Promise<User[]> {
    const xCenter = center.coordinates[0];
    const yCenter = center.coordinates[1];
    const volunteers = await this.UserModel.find({
      location: {
        $geoWithin: { $center: [[xCenter, yCenter], distance] },
      },
      role: UserRole.VOLUNTEER,
    });
    return volunteers;
  }

  async checkAdminCredentials(login: string, password: string): Promise<User> | null {
    let comparePassword: boolean;
    const admin = await this.UserModel.findOne({
      role: UserRole.ADMIN,
      administrative: { login },
    });
    if (admin) {
      comparePassword = await this.hashService.compareHash(password, admin.administrative.password);
    }
    if (comparePassword) {
      return admin.toObject();
    }
    return null;
  }

  async checkVKCredentials(vkID: number): Promise<User> | null {
    const user = await this.UserModel.findOne({
      role: { $in: [UserRole.RECIPIENT, UserRole.VOLUNTEER] },
      vkID,
    }).orFail(new Error(exceptions.users.notFound));
    return user.toObject();
  }
}