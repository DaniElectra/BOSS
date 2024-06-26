import crypto from 'node:crypto';
import path from 'node:path';
import { Readable } from 'node:stream';
import fs from 'fs-extra';
import { createChannel, createClient, Metadata } from 'nice-grpc';
import { GetObjectCommand, PutObjectCommand, S3 } from '@aws-sdk/client-s3';
import { AccountClient, AccountDefinition } from '@pretendonetwork/grpc/account/account_service';
import { FriendsClient, FriendsDefinition } from '@pretendonetwork/grpc/friends/friends_service';
import { GetNEXDataResponse } from '@pretendonetwork/grpc/account/get_nex_data_rpc';
import { GetUserDataResponse } from '@pretendonetwork/grpc/account/get_user_data_rpc';
import { GetUserFriendPIDsResponse } from '@pretendonetwork/grpc/friends/get_user_friend_pids_rpc';
import { config, disabledFeatures } from '@/config-manager';

let s3: S3;

if (!disabledFeatures.s3) {
	s3 = new S3({
		forcePathStyle: false,
		endpoint: config.cdn.s3.endpoint,
		region: config.cdn.s3.region,
		credentials: {
			accessKeyId: config.cdn.s3.key,
			secretAccessKey: config.cdn.s3.secret
		}
	});
}

const gRPCAccountChannel = createChannel(`${config.grpc.account.address}:${config.grpc.account.port}`);
const gRPCAccountClient: AccountClient = createClient(AccountDefinition, gRPCAccountChannel);

const gRPCFriendsChannel = createChannel(`${config.grpc.friends.address}:${config.grpc.friends.port}`);
const gRPCFriendsClient: FriendsClient = createClient(FriendsDefinition, gRPCFriendsChannel);

const VALID_COUNTRIES = [
	'GB', 'US', 'IT', 'NL', 'DE', 'CA', 'FR', 'HU', 'CR',
	'AU', 'BR', 'RO', 'CL', 'MX', 'RU', 'ES', 'JP', 'CZ',
	'PT', 'MT', 'AR', 'SE', 'PL', 'IE', 'BE', 'HT', 'NO',
	'FI', 'GR', 'BO', 'AT', 'VE', 'PA', 'PE', 'GF', 'SA',
	'CO', 'LT', 'NA', 'CH', 'CY', 'RS', 'KY', 'GP', 'DK',
	'KR', 'LU', 'SV', 'VA', 'GT', 'SK', 'HR', 'ZA', 'DO',
	'UY', 'LV', 'HN', 'JM', 'TR', 'IN', 'ER', 'AW', 'NZ',
	'EC', 'TW', 'EE', 'CN', 'SI', 'AI', 'BG', 'NI', 'IS',
	'MQ', 'BZ', 'BA', 'MY', 'AZ', 'ZW', 'AL', 'IM', 'VG',
	'VI', 'BM', 'GY', 'SR', 'MS', 'TC', 'BB', 'TT'
];

const VALID_LANGUAGES = [
	'en', 'it', 'de', 'fr', 'es', 'us', 'pt', 'ru', 'ja',
	'nl', 'ko', 'zh', 'tw'
];

const VALID_FILE_TYPES = [
	'Message', 'AppData'
];

const VALID_FILE_NOTIFY_CONDITIONS = [
	'app', 'account'
];

export function md5(input: crypto.BinaryLike): string {
	return crypto.createHash('md5').update(input).digest('hex');
}

export function isValidCountryCode(countryCode: string): boolean {
	return VALID_COUNTRIES.includes(countryCode);
}

export function isValidLanguage(language: string): boolean {
	return VALID_LANGUAGES.includes(language);
}

export function isValidFileType(type: string): boolean {
	return VALID_FILE_TYPES.includes(type);
}

export function isValidFileNotifyCondition(condition: string): boolean {
	return VALID_FILE_NOTIFY_CONDITIONS.includes(condition);
}

export async function getUserDataByPID(pid: number): Promise<GetUserDataResponse | null> {
	try {
		return await gRPCAccountClient.getUserData({
			pid: pid
		}, {
			metadata: Metadata({
				'X-API-Key': config.grpc.account.api_key
			})
		});
	} catch {
		// TODO - Handle error
		return null;
	}
}

export async function getNEXDataByPID(pid: number): Promise<GetNEXDataResponse | null> {
	try {
		return await gRPCAccountClient.getNEXData({
			pid: pid
		}, {
			metadata: Metadata({
				'X-API-Key': config.grpc.account.api_key
			})
		});
	} catch {
		// TODO - Handle error
		return null;
	}
}

export async function getUserDataByToken(token: string): Promise<GetUserDataResponse | null> {
	try {
		return await gRPCAccountClient.exchangeTokenForUserData({
			token: token
		}, {
			metadata: Metadata({
				'X-API-Key': config.grpc.account.api_key
			})
		});
	} catch (error) {
		// TODO - Handle error
		console.log(error);
		return null;
	}
}

export async function getFriends(pid: number): Promise<GetUserFriendPIDsResponse | null> {
	try {
		return await gRPCFriendsClient.getUserFriendPIDs({
			pid: pid
		}, {
			metadata: Metadata({
				'X-API-Key': config.grpc.friends.api_key
			})
		});
	} catch {
		// TODO - Handle error
		return null;
	}
}

export async function getCDNFileStream(key: string): Promise<Readable | fs.ReadStream | null> {
	try {
		if (disabledFeatures.s3) {
			return await getLocalCDNFile(key);
		} else {
			const response = await s3.send(new GetObjectCommand({
				Key: key,
				Bucket: config.cdn.s3.bucket
			}));

			if (!response.Body) {
				return null;
			}

			return response.Body as Readable;
		}
	} catch (error) {
		return null;
	}
}

export async function getLocalCDNFile(key: string): Promise<fs.ReadStream | null> {
	const filePath = path.join(config.cdn.disk_path, key);

	if (await !fs.exists(filePath)) {
		return null;
	}

	return fs.createReadStream(filePath);
}

export async function uploadCDNFile(key: string, data: Buffer): Promise<void> {
	if (disabledFeatures.s3) {
		await writeLocalCDNFile(key, data);
	} else {
		await s3.send(new PutObjectCommand({
			Key: key,
			Bucket: config.cdn.s3.bucket,
			Body: data,
			ACL: 'private'
		}));
	}
}

export async function writeLocalCDNFile(key: string, data: Buffer): Promise<void> {
	const filePath = path.join(config.cdn.disk_path, key);
	const folder = path.dirname(filePath);

	await fs.ensureDir(folder);
	await fs.writeFile(filePath, data);
}
