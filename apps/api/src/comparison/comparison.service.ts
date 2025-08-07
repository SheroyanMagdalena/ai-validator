// src/comparison/comparison.service.ts
import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class ComparisonService {
  constructor(private readonly httpService: HttpService) {}

  async fetchApiData(url: string): Promise<any> {
    try {
      const response = await firstValueFrom(this.httpService.get(url));
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch data from ${url}: ${error.message}`);
    }
  }
}