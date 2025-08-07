import { IsUrl } from 'class-validator';

export class CompareApisDto {
  @IsUrl()
  readonly apiUrl1: string;

  @IsUrl()
  readonly apiUrl2: string;
}