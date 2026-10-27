from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class DemoLogin(StrictModel):
    name: str = Field(default='Anubhav',min_length=1,max_length=120)
    hostel_block: str = Field(default='C',min_length=1,max_length=80)


class ProfilePatch(StrictModel):
    name: str | None = Field(default=None,min_length=1,max_length=120)
    hostel_block: str | None = Field(default=None,min_length=1,max_length=80)


class Booking(StrictModel):
    destination_hostel_block: str = Field(min_length=1,max_length=80)
    parcel_label: str = Field(default='Parcel',min_length=1,max_length=120)


class DemoAdvance(StrictModel):
    action: Literal['load','dispatch','arrive','pay','close_lid']


class DeviceMessage(StrictModel):
    schema_version: Literal[1] = 1
    message_type: Literal['telemetry','event','ack']
    message_id: UUID
    bot_id: UUID
    sent_at: str
    boot_id: UUID | None = None
    sequence: int | None = Field(default=None,ge=0)
    event: Literal['loaded','arrived','inner_lid_closed','fault','heartbeat'] | None = None
    order_id: UUID | None = None
    compartment: int | None = Field(default=None,ge=1,le=3)
    command_id: UUID | None = None
    result: Literal['accepted','executed','rejected'] | None = None
    current_lat: float | None = Field(default=None,ge=-90,le=90,allow_inf_nan=False)
    current_lng: float | None = Field(default=None,ge=-180,le=180,allow_inf_nan=False)
    battery_level: float | None = Field(default=None,ge=0,le=100,allow_inf_nan=False)
    outer_closed: bool | None = None
    inner_closed: bool | None = None
    is_empty: bool | None = None
    clock_synchronized: bool = False
    reason: str | None = Field(default=None,max_length=200)

    @field_validator('sent_at')
    @classmethod
    def utc_time(cls, value):
        from datetime import datetime
        parsed = datetime.fromisoformat(value.replace('Z','+00:00'))
        if parsed.tzinfo is None:
            raise ValueError('sent_at must be timezone-aware')
        return value
